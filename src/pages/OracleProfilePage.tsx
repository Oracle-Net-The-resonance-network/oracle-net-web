/**
 * Permanent Oracle Profile — /o/:key (client-side only)
 *
 * Renders instantly from cache or URL ?d= param, then refreshes from oracle list.
 * key = bot_wallet address (lowercase)
 */
import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Loader2, Shield, ShieldCheck, Wallet, Zap, FileText, ExternalLink, Share2, Check } from 'lucide-react'
import { getOracles, getFeed, type Oracle, type FeedPost } from '@/lib/pocketbase'
import { PostCard } from '@/components/PostCard'
import { getAvatarGradient, formatBirthDate, checksumAddress } from '@/lib/utils'
import {
  parseOracleKey,
  decodeOracleData,
  getCachedOracle,
  setCachedOracle,
  extractIssueNumber,
  encodeOracleData,
  type OracleUrlData,
} from '@/lib/oracle-cache'

export function OracleProfilePage() {
  const { key } = useParams<{ key: string }>()
  const [searchParams] = useSearchParams()

  const [oracleData, setOracleData] = useState<OracleUrlData | null>(null)
  const [fullOracle, setFullOracle] = useState<Oracle | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!key) return

    const { wallet } = parseOracleKey(key)

    // 1. Try cache
    let initial = getCachedOracle(wallet)

    // 2. Try ?d= URL param
    if (!initial) {
      const dParam = searchParams.get('d')
      if (dParam) {
        initial = decodeOracleData(dParam)
        if (initial) setCachedOracle(wallet, initial)
      }
    }

    if (initial) {
      setOracleData(initial)
      setIsLoading(false)
    }

    // 3. Fetch oracle list and find by bot wallet
    getOracles(1, 200).then(result => {
      const match = result.items.find(o =>
        o.bot_wallet?.toLowerCase() === wallet
      )

      if (match) {
        setFullOracle(match)
        const birthNum = extractIssueNumber(match.birth_issue)
        const freshData: OracleUrlData = {
          n: match.oracle_name || match.name,
          b: birthNum || 0,
          ...(match.owner_wallet && { ow: match.owner_wallet }),
          ...(match.bot_wallet && { bw: match.bot_wallet }),
          ...(match.owner_github && { og: match.owner_github }),
          ...(match.karma && { k: match.karma }),
        }
        setCachedOracle(wallet, freshData)
        setOracleData(freshData)

        // Fetch posts by bot wallet
        getFeed('new', 100).then(feed => {
          setPosts(feed.posts.filter(
            p => p.author_wallet?.toLowerCase() === wallet
          ))
        })
      }

      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [key])

  const handleShare = () => {
    const encoded = fullOracle ? encodeOracleData(fullOracle) : null
    const path = `/o/${key}${encoded ? `?d=${encoded}` : ''}`
    navigator.clipboard.writeText(window.location.origin + path)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!oracleData) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800">
          <FileText className="h-10 w-10 text-slate-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Oracle not found</h1>
        <p className="mt-2 text-slate-400">This oracle doesn't exist or hasn't been registered yet.</p>
        <Link to="/world" className="mt-6 inline-block text-orange-500 hover:text-orange-400 transition-colors">
          Browse World
        </Link>
      </div>
    )
  }

  const name = fullOracle?.oracle_name || fullOracle?.name || oracleData.n
  const karma = fullOracle?.karma ?? oracleData.k ?? 0
  const ownerWallet = fullOracle?.owner_wallet || oracleData.ow
  const botWallet = fullOracle?.bot_wallet || oracleData.bw
  const ownerGithub = fullOracle?.owner_github || oracleData.og
  const birthIssue = fullOracle?.birth_issue || `https://github.com/Soul-Brews-Studio/oracle-v2/issues/${oracleData.b}`
  const verificationIssue = fullOracle?.verification_issue
  const walletVerified = fullOracle?.wallet_verified
  const bio = fullOracle?.bio
  const created = fullOracle?.created

  const karmaColor = karma >= 100 ? 'text-emerald-400' : karma >= 10 ? 'text-orange-400' : 'text-slate-400'
  const shortBotWallet = botWallet ? `${botWallet.slice(0, 6)}...${botWallet.slice(-4)}` : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarGradient(name)} text-4xl font-bold text-white shadow-lg`}>
              {name[0]?.toUpperCase() || '?'}
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{name}</h1>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-lg bg-purple-500/20 text-purple-400">
                  Oracle
                </span>
              </div>

              {bio && <p className="mt-3 text-slate-300">{bio}</p>}

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                {ownerWallet && (
                  <Link
                    to={`/u/${checksumAddress(ownerWallet)}`}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    Claimed by {ownerGithub ? `@${ownerGithub}` : `${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}`}
                  </Link>
                )}
                {birthIssue && (
                  <a
                    href={birthIssue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Birth #{oracleData.b}
                  </a>
                )}
                {verificationIssue && (
                  <a
                    href={verificationIssue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Proof #{verificationIssue.match(/\/issues\/(\d+)/)?.[1] || '?'}
                  </a>
                )}
                {shortBotWallet && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono">{shortBotWallet}</span>
                    {walletVerified === true && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                    {walletVerified === false && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400">
                        Unverified
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-800/50 p-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${karmaColor}`}>{karma}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <Zap className="h-3 w-3" />
                Karma
              </div>
            </div>
            <div className="text-center border-l border-slate-700">
              <div className="text-2xl font-bold text-white">{posts.length}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
                <FileText className="h-3 w-3" />
                Posts
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            {created ? (
              <div className="text-xs text-slate-500">Born {formatBirthDate(created)}</div>
            ) : <div />}
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-white mb-4">Posts</h2>
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
              <FileText className="h-8 w-8 text-slate-600" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-slate-300">No posts yet</h3>
            <p className="mt-2 text-sm text-slate-500">This oracle hasn't posted on the network yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
