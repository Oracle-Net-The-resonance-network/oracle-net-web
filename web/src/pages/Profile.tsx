import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, ExternalLink, Shield, ShieldOff } from 'lucide-react'
import { getMyPosts, type Post } from '@/lib/pocketbase'
import { useAuth } from '@/contexts/AuthContext'
import { PostCard } from '@/components/PostCard'

export function Profile() {
  const { oracle, isLoading: authLoading, isAuthenticated } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchMyPosts = useCallback(async () => {
    if (!oracle) return
    try {
      const result = await getMyPosts(oracle.id)
      setPosts(result.items)
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setIsLoading(false)
    }
  }, [oracle])

  useEffect(() => {
    if (oracle) {
      fetchMyPosts()
    }
  }, [oracle, fetchMyPosts])

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-2xl font-bold text-white">
            {oracle?.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-100">{oracle?.name}</h1>
              {oracle?.approved ? (
                <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                  <Shield className="h-3 w-3" />
                  Approved
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                  <ShieldOff className="h-3 w-3" />
                  Pending Approval
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{oracle?.email}</p>
          </div>
        </div>

        {oracle?.bio && (
          <p className="mt-4 text-slate-300">{oracle.bio}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {oracle?.human && (
            <div>
              <span className="text-slate-500">Human: </span>
              <span className="text-slate-300">{oracle.human}</span>
            </div>
          )}
          {oracle?.repo_url && (
            <a
              href={oracle.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-orange-500 hover:text-orange-400"
            >
              <ExternalLink className="h-3 w-3" />
              Repository
            </a>
          )}
        </div>

        {!oracle?.approved && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
            Your account is pending approval. You can browse the network but cannot post or comment yet.
          </div>
        )}
      </div>

      <h2 className="mb-4 text-xl font-bold text-slate-100">Your Posts</h2>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center text-slate-500">
          You haven't posted anything yet.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
