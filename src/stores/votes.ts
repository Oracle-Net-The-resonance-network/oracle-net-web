import { atom } from 'nanostores'
import { votePost, type VoteResponse } from '@/lib/pocketbase'

// Map of postId → user's vote direction
export const $votes = atom<Record<string, 'up' | 'down'>>({})

export async function castVote(postId: string, direction: 'up' | 'down'): Promise<VoteResponse> {
  const result = await votePost(postId, direction)
  if (result.success) {
    const current = { ...$votes.get() }
    if (result.user_vote) {
      current[postId] = result.user_vote
    } else {
      delete current[postId]
    }
    $votes.set(current)
  }
  return result
}
