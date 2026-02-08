/**
 * Oracle permanent URL cache — client-side only, stale-while-revalidate
 *
 * URL format: /o/:key where key = bot_wallet address (lowercase)
 * Optional ?d= param carries base64url-encoded display data for instant rendering
 */

import type { Oracle } from './pocketbase'

// Compact oracle data for URL encoding
export interface OracleUrlData {
  n: string   // name
  b: number   // birth issue number
  ow?: string // owner wallet
  bw?: string // bot wallet
  og?: string // owner github
  k?: number  // karma
}

export interface OracleCacheEntry {
  data: OracleUrlData
  fetchedAt: number
}

const CACHE_KEY = 'oracle-cache'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

// --- Key utilities ---

export function parseOracleKey(key: string): { wallet: string } {
  return { wallet: key.toLowerCase() }
}

/** Extract birth issue number from a full GitHub issue URL */
export function extractIssueNumber(url: string | undefined): number | null {
  if (!url) return null
  const match = url.match(/\/issues\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/** Build permanent key from an Oracle object (bot_wallet, lowercase) */
export function oracleToKey(oracle: Oracle): string | null {
  return oracle.bot_wallet?.toLowerCase() || null
}

// --- Base64url for ?d= param ---

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return atob(s)
}

export function encodeOracleData(oracle: Oracle): string {
  const birthNum = extractIssueNumber(oracle.birth_issue)
  if (!birthNum) return ''

  const data: OracleUrlData = {
    n: oracle.oracle_name || oracle.name,
    b: birthNum,
  }
  if (oracle.owner_wallet) data.ow = oracle.owner_wallet
  if (oracle.bot_wallet) data.bw = oracle.bot_wallet
  if (oracle.owner_github) data.og = oracle.owner_github
  if (oracle.karma) data.k = oracle.karma

  return base64urlEncode(JSON.stringify(data))
}

export function decodeOracleData(encoded: string): OracleUrlData | null {
  try {
    return JSON.parse(base64urlDecode(encoded))
  } catch {
    return null
  }
}

// --- localStorage cache ---

function loadCache(): Map<string, OracleCacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new Map()
    const entries: [string, OracleCacheEntry][] = JSON.parse(raw)
    return new Map(entries)
  } catch {
    return new Map()
  }
}

function saveCache(cache: Map<string, OracleCacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...cache.entries()]))
  } catch {
    localStorage.removeItem(CACHE_KEY)
  }
}

let memoryCache: Map<string, OracleCacheEntry> | null = null

function getCache(): Map<string, OracleCacheEntry> {
  if (!memoryCache) memoryCache = loadCache()
  return memoryCache
}

export function getCachedOracle(key: string): OracleUrlData | null {
  const entry = getCache().get(key)
  return entry?.data ?? null
}

export function setCachedOracle(key: string, data: OracleUrlData) {
  const cache = getCache()
  cache.set(key, { data, fetchedAt: Date.now() })
  saveCache(cache)
}

export function isCacheStale(key: string): boolean {
  const entry = getCache().get(key)
  if (!entry) return true
  return Date.now() - entry.fetchedAt > CACHE_TTL
}

/** Build a shareable permanent URL with ?d= param */
export function buildPermanentUrl(oracle: Oracle): string | null {
  const key = oracleToKey(oracle)
  if (!key) return null
  const encoded = encodeOracleData(oracle)
  return `/o/${key}${encoded ? `?d=${encoded}` : ''}`
}

/** Cache all oracles from an API list response */
export function cacheOracleList(oracles: Oracle[]) {
  for (const oracle of oracles) {
    const key = oracleToKey(oracle)
    if (!key) continue
    const birthNum = extractIssueNumber(oracle.birth_issue)
    if (!birthNum) continue

    const data: OracleUrlData = {
      n: oracle.oracle_name || oracle.name,
      b: birthNum,
    }
    if (oracle.owner_wallet) data.ow = oracle.owner_wallet
    if (oracle.bot_wallet) data.bw = oracle.bot_wallet
    if (oracle.owner_github) data.og = oracle.owner_github
    if (oracle.karma) data.k = oracle.karma

    setCachedOracle(key, data)
  }
}
