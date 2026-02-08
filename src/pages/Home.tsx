import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Flame, Clock, TrendingUp, Zap, Wallet, Fingerprint } from 'lucide-react'
import { useAccount } from 'wagmi'
import { getFeed, getMyVotes, type FeedPost, type SortType } from '@/lib/pocketbase'
import { PostCard } from '@/components/PostCard'
import { CreatePost } from '@/components/CreatePost'
import { useAuth } from '@/contexts/AuthContext'

const SORT_OPTIONS: { value: SortType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'hot', label: 'Hot', icon: Flame },
  { value: 'new', label: 'New', icon: Clock },
  { value: 'top', label: 'Top', icon: TrendingUp },
  { value: 'rising', label: 'Rising', icon: Zap },
]

function PostSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 animate-pulse">
      <div className="flex">
        <div className="flex flex-col items-center gap-2 p-3 border-r border-slate-800">
          <div className="h-6 w-6 rounded bg-slate-800" />
          <div className="h-4 w-4 rounded bg-slate-800" />
          <div className="h-6 w-6 rounded bg-slate-800" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-800" />
            <div className="h-4 w-24 rounded bg-slate-800" />
          </div>
          <div className="h-5 w-3/4 rounded bg-slate-800" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-slate-800/60" />
            <div className="h-3 w-5/6 rounded bg-slate-800/60" />
          </div>
          <div className="h-3 w-20 rounded bg-slate-800/40" />
        </div>
      </div>
    </div>
  )
}

export function Home() {
  const { isAuthenticated } = useAuth()
  const { isConnected } = useAccount()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortType, setSortType] = useState<SortType>('hot')

  const fetchPosts = useCallback(async () => {
    try {
      setError('')
      const result = await getFeed(sortType, 50)
      if (result.success) {
        setPosts(result.posts)
        if (isAuthenticated && result.posts.length > 0) {
          const postIds = result.posts.map(p => p.id)
          const votes = await getMyVotes(postIds)
          setUserVotes(votes)
        }
      } else {
        setError('Failed to load feed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setIsLoading(false)
    }
  }, [sortType, isAuthenticated])

  useEffect(() => {
    setIsLoading(true)
    fetchPosts()
  }, [fetchPosts])

  const handleRefresh = () => {
    setIsLoading(true)
    fetchPosts()
  }

  const handleVoteUpdate = (postId: string, upvotes: number, downvotes: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, upvotes, downvotes, score: upvotes - downvotes }
        : p
    ))
  }

  // Gate feed behind wallet connection
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 p-3">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Connect to View Feed</h1>
          <p className="mt-2 text-slate-400">Connect your wallet to access the Oracle network feed.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 font-medium text-white hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25"
          >
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Sort tabs + refresh — compact top bar */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setSortType(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                sortType === value
                  ? 'bg-orange-500/20 text-orange-500'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isAuthenticated && (
        <div className="mb-5">
          <CreatePost onPostCreated={handleRefresh} />
        </div>
      )}

      {isLoading && posts.length === 0 ? (
        <div className="space-y-4">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-red-400">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/80">
            <Fingerprint className="h-7 w-7 text-slate-600" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-slate-300">No posts yet</h3>
          <p className="mt-1 text-sm text-slate-500">Be the first to share something with the network.</p>
        </div>
       ) : (
         <div className="space-y-3">
           {posts.map((post) => (
            <PostCard key={post.id} post={post} initialUserVote={userVotes[post.id] ?? null} onVoteUpdate={handleVoteUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
