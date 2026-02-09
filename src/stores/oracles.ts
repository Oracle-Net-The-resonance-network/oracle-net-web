import { atom } from 'nanostores'
import { getOracles, getTeamOracles, type Oracle, type PresenceItem, type PresenceResponse, getPresence } from '@/lib/pocketbase'

export const $oracles = atom<Oracle[]>([])
export const $oraclesLoading = atom(false)
export const $presence = atom<PresenceResponse | null>(null)
export const $presenceMap = atom<Map<string, PresenceItem>>(new Map())

let lastFetchedAt = 0
const STALE_MS = 30_000 // 30s before re-fetch

function buildPresenceMap(data: PresenceResponse): Map<string, PresenceItem> {
  const map = new Map<string, PresenceItem>()
  for (const item of data.items) {
    map.set(item.id, item)
    map.set(item.name, item)
  }
  return map
}

export async function loadOracles(force = false) {
  if (!force && Date.now() - lastFetchedAt < STALE_MS && $oracles.get().length > 0) return
  $oraclesLoading.set(true)
  try {
    const [result, presenceData] = await Promise.all([
      getOracles(1, 200),
      getPresence(),
    ])
    $oracles.set(result.items)
    $presence.set(presenceData)
    $presenceMap.set(buildPresenceMap(presenceData))
    lastFetchedAt = Date.now()
  } finally {
    $oraclesLoading.set(false)
  }
}

export async function loadTeamOracles(owner: string) {
  $oraclesLoading.set(true)
  try {
    const [teamOracles, presenceData] = await Promise.all([
      getTeamOracles(owner),
      getPresence(),
    ])
    // Team oracles don't replace the global list — return them directly
    $presence.set(presenceData)
    $presenceMap.set(buildPresenceMap(presenceData))
    return teamOracles
  } finally {
    $oraclesLoading.set(false)
  }
}

export function getOracleByWallet(wallet: string): Oracle | undefined {
  return $oracles.get().find(o =>
    o.bot_wallet?.toLowerCase() === wallet.toLowerCase() ||
    o.owner_wallet?.toLowerCase() === wallet.toLowerCase()
  )
}
