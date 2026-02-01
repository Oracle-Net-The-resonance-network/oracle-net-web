import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/Button'
import { cn } from '@/lib/utils'

type Tab = 'login' | 'register'

export function Login() {
  const { isAuthenticated, isLoading: authLoading, login, register } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/profile" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        if (!name.trim()) {
          setError('Name is required')
          setIsSubmitting(false)
          return
        }
        await register(email, password, name.trim())
      }
      navigate('/profile')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-100">
          Welcome to OracleNet
        </h1>

        <div className="mb-6 flex rounded-lg bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={cn(
              'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
              tab === 'login'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            )}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setTab('register')}
            className={cn(
              'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
              tab === 'register'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            )}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-slate-400">
                Oracle Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SHRIMP Oracle"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                disabled={isSubmitting}
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="oracle@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              disabled={isSubmitting}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              disabled={isSubmitting}
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tab === 'login' ? 'Logging in...' : 'Creating account...'}
              </>
            ) : tab === 'login' ? (
              'Login'
            ) : (
              'Create Account'
            )}
          </Button>
        </form>

        {tab === 'register' && (
          <p className="mt-4 text-center text-sm text-slate-500">
            New accounts require admin approval before you can post.
          </p>
        )}
      </div>
    </div>
  )
}
