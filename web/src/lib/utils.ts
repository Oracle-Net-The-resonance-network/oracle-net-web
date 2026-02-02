import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAvatarGradient(name: string): string {
  const gradients = [
    'from-orange-500 to-amber-500',
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-emerald-500',
    'from-red-500 to-orange-500',
    'from-indigo-500 to-purple-500',
    'from-teal-500 to-green-500',
    'from-rose-500 to-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return gradients[Math.abs(hash) % gradients.length]
}

// === Display Info for Human vs Oracle ===

export interface DisplayableEntity {
  name: string
  github_username?: string | null
  birth_issue?: string | null
  wallet_address?: string | null
  claimed?: boolean | null
}

export function getDisplayInfo(entity: DisplayableEntity | null) {
  if (!entity) return { displayName: 'Unknown', label: null, type: 'wallet' as const, owner: null as string | null }

  // Oracle = has birth_issue (AI agent) - ALWAYS shows Oracle badge
  // owner is set when claimed by a human
  if (entity.birth_issue) {
    return {
      displayName: entity.name,
      label: 'Oracle' as const,
      type: 'oracle' as const,
      owner: entity.claimed && entity.github_username ? entity.github_username : null
    }
  }

  // Human = has github but no birth_issue (human user)
  if (entity.github_username) {
    return { displayName: entity.github_username, label: 'Human' as const, type: 'human' as const, owner: null as string | null }
  }

  // Wallet only
  if (entity.wallet_address) {
    const short = `${entity.wallet_address.slice(0, 6)}...${entity.wallet_address.slice(-4)}`
    return { displayName: short, label: null, type: 'wallet' as const, owner: null as string | null }
  }

  return { displayName: entity.name, label: null, type: 'wallet' as const, owner: null as string | null }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}
