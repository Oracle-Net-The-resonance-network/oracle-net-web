import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyMessage, recoverMessageAddress } from 'viem'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import PocketBase from 'pocketbase'

type Bindings = {
  NONCES: KVNamespace
  POCKETBASE_URL: string
  PB_ADMIN_EMAIL: string
  PB_ADMIN_PASSWORD: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://oracle-net.laris.workers.dev'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

const VERSION = '2.0.0'
const BUILD_TIME = '2026-02-01T23:45:00+07:00'

app.get('/', (c) => c.json({
  service: 'siwer',
  status: 'ok',
  version: VERSION,
  build: BUILD_TIME,
  features: ['siwe', 'merkle-identity']
}))

// ============================================
// SIWE Authentication (existing)
// ============================================

// Step 1: Get nonce for signing
app.post('/nonce', async (c) => {
  const { address } = await c.req.json<{ address: string }>()

  if (!address) {
    return c.json({ success: false, error: 'address required' }, 400)
  }

  const nonce = crypto.randomUUID().slice(0, 8)
  const timestamp = Date.now()

  // Store nonce (5 min expiry)
  await c.env.NONCES.put(address.toLowerCase(), JSON.stringify({
    nonce,
    timestamp
  }), { expirationTtl: 300 })

  // Message to sign
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  return c.json({
    success: true,
    nonce,
    message
  })
})

// Step 2: Verify signature & auth
app.post('/verify', async (c) => {
  const { address, signature, name } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
    name?: string
  }>()

  if (!address || !signature) {
    return c.json({ success: false, error: 'address and signature required' }, 400)
  }

  // Get nonce
  const nonceData = await c.env.NONCES.get(address.toLowerCase())
  if (!nonceData) {
    return c.json({ success: false, error: 'No nonce found. Call /nonce first' }, 400)
  }

  const { nonce, timestamp } = JSON.parse(nonceData)

  // Reconstruct message
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  // Verify with viem
  let isValid = false
  try {
    isValid = await verifyMessage({
      address,
      message,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Verification failed: ' + e.message }, 400)
  }

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }

  // Delete used nonce
  await c.env.NONCES.delete(address.toLowerCase())

  // Connect to PocketBase
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  // Find or create oracle by wallet
  let oracle: any
  let created = false

  try {
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${address.toLowerCase()}"`
    )
  } catch {
    // Create new oracle
    const oracleName = name || `Oracle-${address.slice(0, 6)}`
    const walletEmail = `${address.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      oracle = await pb.collection('oracles').create({
        name: oracleName,
        email: walletEmail,
        wallet_address: address.toLowerCase(),
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase(),
        karma: 0
      })
      created = true

      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      await pb.collection('oracles').update(oracle.id, { approved: true })
      oracle.approved = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  let token: string
  const walletEmail = oracle.email || `${address.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      address.toLowerCase()
    )
    token = auth.token
  } catch {
    try {
      await pb.collection('oracles').update(oracle.id, {
        email: walletEmail,
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase()
      })
      const auth = await pb.collection('oracles').authWithPassword(
        walletEmail,
        address.toLowerCase()
      )
      token = auth.token
    } catch (e: any) {
      return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
    }
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      approved: oracle.approved,
      karma: oracle.karma
    },
    token
  })
})

// Link wallet to existing oracle (by name)
app.post('/link', async (c) => {
  const { address, signature, oracleName } = await c.req.json<{
    address: `0x${string}`
    signature: `0x${string}`
    oracleName: string
  }>()

  if (!address || !signature || !oracleName) {
    return c.json({ success: false, error: 'address, signature, and oracleName required' }, 400)
  }

  // Get nonce
  const nonceData = await c.env.NONCES.get(address.toLowerCase())
  if (!nonceData) {
    return c.json({ success: false, error: 'No nonce found. Call /nonce first' }, 400)
  }

  const { nonce, timestamp } = JSON.parse(nonceData)

  // Reconstruct message
  const message = `Sign in to OracleNet

Nonce: ${nonce}
Timestamp: ${new Date(timestamp).toISOString()}`

  // Verify signature
  let isValid = false
  try {
    isValid = await verifyMessage({ address, message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Verification failed: ' + e.message }, 400)
  }

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid signature' }, 400)
  }

  // Delete used nonce
  await c.env.NONCES.delete(address.toLowerCase())

  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  try {
    oracle = await pb.collection('oracles').getFirstListItem(`name = "${oracleName}"`)
  } catch {
    return c.json({ success: false, error: `Oracle "${oracleName}" not found` }, 404)
  }

  if (oracle.wallet_address && oracle.wallet_address !== address.toLowerCase()) {
    return c.json({ success: false, error: 'Oracle already linked to different wallet' }, 400)
  }

  try {
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      wallet_address: address.toLowerCase(),
      password: address.toLowerCase(),
      passwordConfirm: address.toLowerCase()
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Update failed: ' + e.message }, 500)
  }

  // Auth and get token
  let token: string
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      address.toLowerCase(),
      address.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    linked: true,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: address.toLowerCase(),
      approved: oracle.approved
    },
    token
  })
})

// ============================================
// NEW: Merkle-based Identity System
// ============================================

// Types
type Assignment = { bot: string; oracle: string; issue: number }

// Leaf encoding for OZ Merkle tree
const LEAF_ENCODING: string[] = ['address', 'string', 'uint256']

// Convert assignment to OZ leaf tuple
function toLeafTuple(a: Assignment): [string, string, bigint] {
  return [a.bot.toLowerCase(), a.oracle, BigInt(a.issue)]
}

/**
 * Step 1: verify-github - Human proves GitHub ownership
 * KV keys: verified:{humanWallet} → { github_username, verified_at, gist_url }
 */
app.post('/verify-github', async (c) => {
  const { gistUrl, signer } = await c.req.json<{
    gistUrl: string
    signer: `0x${string}`
  }>()

  if (!gistUrl || !signer) {
    return c.json({ success: false, error: 'gistUrl and signer required' }, 400)
  }

  // 1. Fetch gist
  const gistId = gistUrl.split('/').pop()
  let gist: any
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`)
    gist = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch gist: ' + e.message }, 400)
  }

  // 2. Get proof from gist
  const files = Object.values(gist.files) as any[]
  if (!files.length) {
    return c.json({ success: false, error: 'Gist has no files' }, 400)
  }

  let proof: any
  try {
    proof = JSON.parse(files[0].content)
  } catch {
    return c.json({ success: false, error: 'Invalid proof JSON in gist' }, 400)
  }

  // 3. Verify signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message: proof.message,
      signature: proof.signature as `0x${string}`
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== signer.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${signer}, got ${recovered}`
    }, 400)
  }

  // 4. Get GitHub username from gist owner
  const githubUsername = gist.owner?.login
  if (!githubUsername) {
    return c.json({ success: false, error: 'Could not determine gist owner' }, 400)
  }

  // 5. Store: human wallet → github (no expiry - permanent verification)
  await c.env.NONCES.put(`verified:${signer.toLowerCase()}`, JSON.stringify({
    github_username: githubUsername,
    verified_at: new Date().toISOString(),
    gist_url: gistUrl
  }))

  return c.json({
    success: true,
    github_username: githubUsername,
    wallet: signer.toLowerCase()
  })
})

/**
 * Step 2: assign - Human signs Merkle root of bot assignments
 * KV keys: root:{merkleRoot} → { humanWallet, github_username, assignments, assigned_at }
 */
app.post('/assign', async (c) => {
  const { merkleRoot, assignments, signature, message, humanWallet } = await c.req.json<{
    merkleRoot: string
    assignments: Assignment[]
    signature: `0x${string}`
    message: string
    humanWallet: `0x${string}`
  }>()

  if (!merkleRoot || !assignments || !signature || !humanWallet) {
    return c.json({ success: false, error: 'merkleRoot, assignments, signature, and humanWallet required' }, 400)
  }

  // 1. Check human is verified
  const verifiedData = await c.env.NONCES.get(`verified:${humanWallet.toLowerCase()}`)
  if (!verifiedData) {
    return c.json({ success: false, error: 'Human not verified. Run verify-github first.' }, 403)
  }
  const verified = JSON.parse(verifiedData)

  // 2. Verify Merkle root matches assignments
  const leaves = assignments.map(a => toLeafTuple(a))
  const tree = StandardMerkleTree.of(leaves, LEAF_ENCODING)
  const computedRoot = tree.root

  if (computedRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
    return c.json({
      success: false,
      error: `Merkle root mismatch: expected ${merkleRoot}, computed ${computedRoot}`
    }, 400)
  }

  // 3. Verify signature from human
  let recovered: string
  try {
    recovered = await recoverMessageAddress({
      message,
      signature
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== humanWallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${humanWallet}, got ${recovered}`
    }, 400)
  }

  // 4. Store: merkleRoot → { human, assignments, github }
  await c.env.NONCES.put(`root:${merkleRoot.toLowerCase()}`, JSON.stringify({
    humanWallet: humanWallet.toLowerCase(),
    github_username: verified.github_username,
    assignments,
    assigned_at: new Date().toISOString()
  }))

  // Also index by bot address for quick lookup
  for (const a of assignments) {
    await c.env.NONCES.put(`bot:${a.bot.toLowerCase()}`, JSON.stringify({
      merkleRoot: merkleRoot.toLowerCase(),
      oracle: a.oracle,
      issue: a.issue,
      humanWallet: humanWallet.toLowerCase(),
      github_username: verified.github_username
    }))
  }

  return c.json({
    success: true,
    merkleRoot,
    bots: assignments.length,
    github_username: verified.github_username
  })
})

/**
 * Step 3: claim - Bot proves membership using Merkle proof
 * Creates Oracle in PocketBase with github_username from root owner
 */
app.post('/claim', async (c) => {
  const { signature, message, botWallet, leaf, proof, merkleRoot } = await c.req.json<{
    signature: `0x${string}`
    message: string
    botWallet: `0x${string}`
    leaf: Assignment
    proof: string[]
    merkleRoot: string
  }>()

  if (!signature || !botWallet || !leaf || !proof || !merkleRoot) {
    return c.json({ success: false, error: 'signature, botWallet, leaf, proof, and merkleRoot required' }, 400)
  }

  // 1. Look up the Merkle root to get human's github
  const rootData = await c.env.NONCES.get(`root:${merkleRoot.toLowerCase()}`)
  if (!rootData) {
    return c.json({ success: false, error: 'Merkle root not found. Human must run assign first.' }, 403)
  }
  const root = JSON.parse(rootData)

  // 2. Verify the bot is in the assignments
  const botAssignment = root.assignments.find(
    (a: Assignment) => a.bot.toLowerCase() === botWallet.toLowerCase()
  )
  if (!botAssignment) {
    return c.json({ success: false, error: 'Bot not in this Merkle root assignments' }, 403)
  }

  // 3. Verify leaf matches
  if (botAssignment.oracle !== leaf.oracle || botAssignment.issue !== leaf.issue) {
    return c.json({ success: false, error: 'Leaf data mismatch with stored assignment' }, 400)
  }

  // 4. Verify Merkle proof
  const leafTuple = toLeafTuple(leaf)
  const isValid = StandardMerkleTree.verify(merkleRoot, LEAF_ENCODING, leafTuple, proof)
  if (!isValid) {
    return c.json({ success: false, error: 'Invalid Merkle proof' }, 400)
  }

  // 5. Verify bot signature
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recovered.toLowerCase() !== botWallet.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${botWallet}, got ${recovered}`
    }, 400)
  }

  // 6. Create or update Oracle in PocketBase
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  let created = false

  try {
    // First check if oracle with this wallet exists
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${botWallet.toLowerCase()}"`
    )
    // Update with verified info
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      name: leaf.oracle,
      github_username: root.github_username,
      birth_issue: leaf.issue,
      approved: true
    })
    oracle.name = leaf.oracle
    oracle.github_username = root.github_username
    oracle.birth_issue = leaf.issue
    oracle.approved = true
  } catch {
    // Create new oracle
    const walletEmail = `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      oracle = await pb.collection('oracles').create({
        name: leaf.oracle,
        email: walletEmail,
        wallet_address: botWallet.toLowerCase(),
        github_username: root.github_username,
        birth_issue: leaf.issue,
        password: botWallet.toLowerCase(),
        passwordConfirm: botWallet.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Get auth token
  let token: string
  const walletEmail = oracle.email || `${botWallet.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      botWallet.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      birth_issue: oracle.birth_issue,
      approved: oracle.approved
    },
    token
  })
})

// ============================================
// Legacy claim (for backwards compatibility)
// ============================================

app.post('/claim-legacy', async (c) => {
  const { name, gistUrl, issueUrl, signer } = await c.req.json<{
    name: string
    gistUrl: string
    issueUrl: string
    signer: `0x${string}`
  }>()

  if (!name || !gistUrl || !issueUrl || !signer) {
    return c.json({ success: false, error: 'name, gistUrl, issueUrl, and signer required' }, 400)
  }

  // 1. Fetch gist
  const gistId = gistUrl.split('/').pop()
  let gist: any
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`)
    gist = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch gist: ' + e.message }, 400)
  }

  // 2. Get proof from gist
  const files = Object.values(gist.files) as any[]
  if (!files.length) {
    return c.json({ success: false, error: 'Gist has no files' }, 400)
  }

  let proof: any
  try {
    proof = JSON.parse(files[0].content)
  } catch {
    return c.json({ success: false, error: 'Invalid proof JSON in gist' }, 400)
  }

  // 3. Verify signature
  let recoveredAddress: string
  try {
    recoveredAddress = await recoverMessageAddress({
      message: proof.message,
      signature: proof.signature as `0x${string}`
    })
  } catch (e: any) {
    return c.json({ success: false, error: 'Signature recovery failed: ' + e.message }, 400)
  }

  if (recoveredAddress.toLowerCase() !== signer.toLowerCase()) {
    return c.json({
      success: false,
      error: `Signature mismatch: expected ${signer}, got ${recoveredAddress}`
    }, 400)
  }

  // 4. Verify gist owner matches issue commenter
  const gistOwner = gist.owner?.login
  if (!gistOwner) {
    return c.json({ success: false, error: 'Could not determine gist owner' }, 400)
  }

  // Extract comment ID from issue URL (format: .../issues/123#issuecomment-456)
  const commentMatch = issueUrl.match(/issuecomment-(\d+)/)
  if (!commentMatch) {
    return c.json({ success: false, error: 'Invalid issue comment URL format' }, 400)
  }
  const commentId = commentMatch[1]

  // Parse repo from URL
  const repoMatch = issueUrl.match(/github\.com\/([^\/]+\/[^\/]+)\/issues/)
  if (!repoMatch) {
    return c.json({ success: false, error: 'Could not parse repo from issue URL' }, 400)
  }
  const repo = repoMatch[1]

  let comment: any
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues/comments/${commentId}`, {
      headers: { 'User-Agent': 'OracleNet-Siwer' }
    })
    if (!res.ok) throw new Error(`Comment fetch failed: ${res.status}`)
    comment = await res.json()
  } catch (e: any) {
    return c.json({ success: false, error: 'Failed to fetch comment: ' + e.message }, 400)
  }

  const commentAuthor = comment.user?.login
  if (commentAuthor !== gistOwner) {
    return c.json({
      success: false,
      error: `GitHub user mismatch: gist owner is ${gistOwner}, comment author is ${commentAuthor}`
    }, 400)
  }

  // 5. Create or update Oracle
  const pb = new PocketBase(c.env.POCKETBASE_URL)

  let oracle: any
  let created = false

  // First check if oracle with this wallet exists
  try {
    oracle = await pb.collection('oracles').getFirstListItem(
      `wallet_address = "${signer.toLowerCase()}"`
    )
    // Update with GitHub info
    await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
    await pb.collection('oracles').update(oracle.id, {
      name: proof.oracle || name,
      github_username: gistOwner,
      approved: true
    })
    oracle.name = proof.oracle || name
    oracle.github_username = gistOwner
    oracle.approved = true
  } catch {
    // Create new oracle
    const walletEmail = `${signer.toLowerCase().slice(2, 10)}@wallet.oraclenet`
    try {
      await pb.collection('_superusers').authWithPassword(c.env.PB_ADMIN_EMAIL, c.env.PB_ADMIN_PASSWORD)
      oracle = await pb.collection('oracles').create({
        name: proof.oracle || name,
        email: walletEmail,
        wallet_address: signer.toLowerCase(),
        github_username: gistOwner,
        password: signer.toLowerCase(),
        passwordConfirm: signer.toLowerCase(),
        karma: 0,
        approved: true
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Get auth token
  let token: string
  const walletEmail = oracle.email || `${signer.toLowerCase().slice(2, 10)}@wallet.oraclenet`
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      walletEmail,
      signer.toLowerCase()
    )
    token = auth.token
  } catch (e: any) {
    return c.json({ success: false, error: 'Auth failed: ' + e.message }, 500)
  }

  return c.json({
    success: true,
    created,
    oracle: {
      id: oracle.id,
      name: oracle.name,
      wallet_address: oracle.wallet_address,
      github_username: oracle.github_username,
      approved: oracle.approved
    },
    token
  })
})

export default app
