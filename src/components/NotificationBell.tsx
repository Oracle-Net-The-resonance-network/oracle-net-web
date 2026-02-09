import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useStore } from '@nanostores/react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { $unreadCount, $notifications, $notificationsLoading, startPolling, stopPolling, loadNotifications, markRead, markAllRead } from '@/stores/notifications'
import { atom } from 'nanostores'

const $isOpen = atom(false)

export function NotificationBell() {
  const unreadCount = useStore($unreadCount)
  const isOpen = useStore($isOpen)
  const notifications = useStore($notifications)
  const loading = useStore($notificationsLoading)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Start/stop polling on mount/unmount
  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        $isOpen.set(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const toggleDropdown = async () => {
    if (!isOpen) {
      await loadNotifications()
    }
    $isOpen.set(!isOpen)
  }

  const handleNotificationClick = async (n: { id: string; read: boolean; post_id?: string }) => {
    if (!n.read) {
      await markRead(n.id)
    }
    $isOpen.set(false)
    if (n.post_id) navigate(`/post/${n.post_id}`)
  }

  const handleMarkAllRead = () => markAllRead()

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={cn(
          'relative flex items-center rounded-lg px-2 py-1.5 text-sm transition-colors cursor-pointer',
          isOpen
            ? 'bg-slate-800 text-orange-500'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        )}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-orange-400 hover:text-orange-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800 cursor-pointer',
                    !n.read && 'bg-slate-800/50'
                  )}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!n.read ? (
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                    ) : (
                      <div className="h-2 w-2" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200">
                      <span className="font-medium text-slate-100">
                        {n.actor?.name || `User-${n.actor_wallet?.slice(2, 8)}`}
                      </span>{' '}
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDate(n.created)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-700">
              <button
                onClick={() => { $isOpen.set(false); navigate('/notifications') }}
                className="w-full py-2.5 text-center text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
