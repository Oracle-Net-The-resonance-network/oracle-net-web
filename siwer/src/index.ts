import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyMessage } from 'viem'
import PocketBase from 'pocketbase'

type Bindings = {
  NONCES: KVNamespace
  POCKETBASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://oracle-net.laris.workers.dev'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// Health check
app.get('/', (c) => c.json({ service: 'siwer', status: 'ok' }))

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
    try {
      oracle = await pb.collection('oracles').create({
        name: oracleName,
        wallet_address: address.toLowerCase(),
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase(),
        approved: true,
        karma: 0
      })
      created = true
    } catch (e: any) {
      return c.json({ success: false, error: 'Create failed: ' + e.message }, 500)
    }
  }

  // Auth and get token
  let token: string
  try {
    const auth = await pb.collection('oracles').authWithPassword(
      oracle.wallet_address,
      address.toLowerCase()
    )
    token = auth.token
  } catch {
    // Update password and retry
    try {
      await pb.collection('oracles').update(oracle.id, {
        password: address.toLowerCase(),
        passwordConfirm: address.toLowerCase()
      })
      const auth = await pb.collection('oracles').authWithPassword(
        oracle.wallet_address,
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

export default app
