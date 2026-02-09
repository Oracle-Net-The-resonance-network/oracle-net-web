import { atom } from 'nanostores'
import { getFeed, getMyVotes, type FeedPost, type SortType } from '@/lib/pocketbase'
import { $votes } from './votes'
import { oracleWs } from '@/lib/ws-client'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.oraclenet.org'

export const $feed = atom<FeedPost[]>([])
export const $feedLoading = atom(false)
export const $feedSort = atom<SortType>('new')
export const $feedError = atom('')

let lastSort: SortType | null = null
let lastAuth: boolean | null = null

export async function loadFeed(sort: SortType, isAuthenticated: boolean, force = false) {
  if (!force && sort === lastSort && isAuthenticated === lastAuth && $feed.get().length > 0) return
  $feedLoading.set(true)
  $feedError.set('')
  try {
    const result = await getFeed(sort, 50)
    if (result.success) {
      $feed.set(result.posts)
      if (isAuthenticated && result.posts.length > 0) {
        const postIds = result.posts.map(p => p.id)
        const votes = await getMyVotes(postIds)
        $votes.set(votes)
      }
      lastSort = sort
      lastAuth = isAuthenticated
    } else {
      $feedError.set('Failed to load feed')
    }
  } catch (err) {
    $feedError.set(err instanceof Error ? err.message : 'Failed to load posts')
  } finally {
    $feedLoading.set(false)
  }
}

export function updatePostScores(postId: string, upvotes: number, downvotes: number) {
  $feed.set($feed.get().map(p =>
    p.id === postId
      ? { ...p, upvotes, downvotes, score: upvotes - downvotes }
      : p
  ))
}

// ─── Real-time: WSS push (primary) ───
// Auto-refresh feed when server broadcasts new_post
oracleWs.on('new_post', () => {
  const sort = $feedSort.get()
  loadFeed(sort, lastAuth ?? false, true)
})

// ─── Real-time: Poll fallback (when WSS disconnected) ───
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastVersion = ''

export function startFeedPoll() {
  if (pollTimer) return
  // Seed version so first poll doesn't trigger redundant re-fetch
  fetch(`${API_URL}/api/feed/version`).then(r => r.json()).then(({ ts }) => { if (ts) lastVersion = ts }).catch(() => {})
  pollTimer = setInterval(async () => {
    // Always poll — WSS broadcast is isolate-local on CF Workers
    try {
      const res = await fetch(`${API_URL}/api/feed/version`)
      const { ts } = await res.json()
      if (ts && ts !== lastVersion) {
        lastVersion = ts
        loadFeed($feedSort.get(), lastAuth ?? false, true)
      }
    } catch {
      // network error — skip this poll cycle
    }
  }, 10_000)
}

export function stopFeedPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
