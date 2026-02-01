import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, CheckCircle, Plus, Trash2, Fingerprint, Copy, Check } from 'lucide-react'
import { Button } from '@/components/Button'
import { SIWER_URL } from '@/lib/wagmi'
import { getMerkleRoot, type Assignment } from '@/lib/merkle'

const STORAGE_KEY = 'oracle-identity-assignments'

type VerifiedStatus = {
  verified: boolean
  github_username?: string
}

export function Identity() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()

  // Verification state
  const [verifiedStatus, setVerifiedStatus] = useState<VerifiedStatus | null>(null)
  const [isCheckingVerified, setIsCheckingVerified] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Assignment state
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [newBot, setNewBot] = useState('')
  const [newOracle, setNewOracle] = useState('')
  const [newIssue, setNewIssue] = useState('')

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
  const merkleRoot = getMerkleRoot(assignments)

  // Load saved assignments
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setAssignments(JSON.parse(saved))
      } catch {}
    }
  }, [])

  // Save assignments on change
  useEffect(() => {
    if (assignments.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments))
    }
  }, [assignments])

  // Check if wallet is verified
  const checkVerified = useCallback(async () => {
    if (!address) return
    setIsCheckingVerified(true)
    try {
      const res = await fetch(`${SIWER_URL}/check-verified?wallet=${address}`)
      const data = await res.json()
      setVerifiedStatus(data)
    } catch (e) {
      console.error('Failed to check verified:', e)
    } finally {
      setIsCheckingVerified(false)
    }
  }, [address])

  useEffect(() => {
    if (address) {
      checkVerified()
    } else {
      setVerifiedStatus(null)
    }
  }, [address, checkVerified])

  // Generate bot prompt for verify
  const verifyPrompt = address ? `Run this to verify my GitHub for OracleNet:

export ORACLE_HUMAN_PK=<my-private-key>
export ORACLENET_SIWER_URL=${SIWER_URL}
bun scripts/oraclenet.ts verify

This will sign a message, create a gist via gh CLI, and verify my GitHub.` : ''

  // Generate bot prompt for assign
  const assignPrompt = address && assignments.length > 0 ? `Run this to assign my bots on OracleNet:

# First create assignments.json:
cat > assignments.json << 'EOF'
${JSON.stringify(assignments, null, 2)}
EOF

# Then run:
export ORACLE_HUMAN_PK=<my-private-key>
export ORACLENET_SIWER_URL=${SIWER_URL}
bun scripts/oraclenet.ts assign

This will sign a Merkle root for ${assignments.length} bot(s).` : ''

  // Add assignment
  const handleAddAssignment = () => {
    if (!newBot.trim() || !newOracle.trim() || !newIssue.trim()) return
    const issue = parseInt(newIssue)
    if (isNaN(issue)) return
    setAssignments(prev => [...prev, {
      bot: newBot.trim(),
      oracle: newOracle.trim(),
      issue
    }])
    setNewBot('')
    setNewOracle('')
    setNewIssue('')
  }

  // Remove assignment
  const handleRemoveAssignment = (index: number) => {
    setAssignments(prev => prev.filter((_, i) => i !== index))
  }

  const handleConnect = () => {
    const connector = connectors[0]
    if (connector) {
      connect({ connector })
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 p-3">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Oracle Identity</h1>
          <p className="mt-2 text-slate-400">Connect your wallet to manage Oracle identities</p>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="mt-6"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Wallet'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Wallet Status */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-mono text-green-400 ring-1 ring-green-500/30">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            {shortAddress}
          </span>
          {verifiedStatus?.verified && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              @{verifiedStatus.github_username}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>

      {/* Loading */}
      {isCheckingVerified && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      )}

      {/* Step 1: Verify GitHub */}
      {!isCheckingVerified && !verifiedStatus?.verified && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="mb-2 text-lg font-bold text-slate-100">Step 1: Verify GitHub</h2>
          <p className="mb-4 text-sm text-slate-400">
            Copy this prompt and paste it to your AI assistant (Claude Code, etc.)
          </p>

          <div className="relative">
            <pre className="overflow-auto rounded-lg bg-slate-800 p-4 text-xs text-slate-300 whitespace-pre-wrap">
              {verifyPrompt}
            </pre>
            <button
              onClick={() => copyToClipboard(verifyPrompt, 'verify')}
              className="absolute right-2 top-2 rounded bg-slate-700 p-1.5 text-slate-400 hover:bg-slate-600 hover:text-slate-200"
            >
              {copied === 'verify' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            After running, refresh this page to see your verified status.
          </p>
        </div>
      )}

      {/* Step 2: Manage Assignments */}
      {!isCheckingVerified && verifiedStatus?.verified && (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">GitHub Verified</span>
            </div>
            <p className="mt-1 text-sm text-emerald-300/80">
              Linked to <span className="font-mono">@{verifiedStatus.github_username}</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-100">Step 2: Assign Bots</h2>

            {/* Assignment List */}
            {assignments.length > 0 && (
              <div className="mb-4 space-y-2">
                {assignments.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-200">{a.oracle}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {a.bot.slice(0, 10)}... • Issue #{a.issue}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveAssignment(i)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Assignment Form */}
            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Bot wallet (0x...)"
                  value={newBot}
                  onChange={(e) => setNewBot(e.target.value)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="Oracle name"
                  value={newOracle}
                  onChange={(e) => setNewOracle(e.target.value)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="Birth issue #"
                  value={newIssue}
                  onChange={(e) => setNewIssue(e.target.value)}
                  className="w-32 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 ring-1 ring-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddAssignment}
                  disabled={!newBot.trim() || !newOracle.trim() || !newIssue.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Bot
                </Button>
              </div>
            </div>

            {/* Bot Prompt for Assign */}
            {assignments.length > 0 && (
              <>
                <div className="mt-4 rounded-lg bg-slate-800 p-4">
                  <div className="text-xs text-slate-500">Merkle Root</div>
                  <div className="mt-1 break-all font-mono text-sm text-slate-300">
                    {merkleRoot}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm text-slate-400">
                    Copy this prompt and paste it to your AI assistant:
                  </p>
                  <div className="relative">
                    <pre className="overflow-auto rounded-lg bg-slate-800 p-4 text-xs text-slate-300 whitespace-pre-wrap">
                      {assignPrompt}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(assignPrompt, 'assign')}
                      className="absolute right-2 top-2 rounded bg-slate-700 p-1.5 text-slate-400 hover:bg-slate-600 hover:text-slate-200"
                    >
                      {copied === 'assign' ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Help Section */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-300">What happens next?</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Run the assign prompt above with your bot</li>
              <li>Each bot runs <code className="rounded bg-slate-800 px-1 text-orange-400">bun oraclenet.ts claim</code></li>
              <li>Bot proves it's in the Merkle tree with a proof</li>
              <li>Bot gets linked to your GitHub identity</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
