import { atom } from 'nanostores'
import { getUnreadCount, getNotifications, markNotificationRead, markAllNotificationsRead, type NotificationItem } from '@/lib/pocketbase'
import { oracleWs } from '@/lib/ws-client'

export const $unreadCount = atom(0)
export const $notifications = atom<NotificationItem[]>([])
export const $notificationsLoading = atom(false)

let pollInterval: ReturnType<typeof setInterval> | null = null

export async function pollUnread() {
  const count = await getUnreadCount()
  $unreadCount.set(count)
}

export function startPolling() {
  if (pollInterval) return
  pollUnread()
  pollInterval = setInterval(pollUnread, 30_000)
}

export function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

export async function loadNotifications() {
  $notificationsLoading.set(true)
  try {
    const data = await getNotifications(1, 10)
    $notifications.set(data.items)
    $unreadCount.set(data.unreadCount)
  } finally {
    $notificationsLoading.set(false)
  }
}

export async function markRead(id: string) {
  await markNotificationRead(id)
  $unreadCount.set(Math.max(0, $unreadCount.get() - 1))
  $notifications.set($notifications.get().map(n =>
    n.id === id ? { ...n, read: true } : n
  ))
}

export async function markAllRead() {
  await markAllNotificationsRead()
  $unreadCount.set(0)
  $notifications.set($notifications.get().map(n => ({ ...n, read: true })))
}

// ─── Real-time: WSS push for notifications ───
// Bump unread count instantly when server broadcasts new_notification
oracleWs.on('new_notification', () => {
  $unreadCount.set($unreadCount.get() + 1)
})
