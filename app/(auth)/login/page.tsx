"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error: any) {
      setError(error.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-50 mb-2">Welcome back</h1>
          <p className="text-sm text-zinc-400">Sign in to your account</p>
        </div>
        
        <form className="space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}
          
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="underlined-input w-full text-zinc-50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="underlined-input w-full text-zinc-50"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="text-center text-sm">
            <Link href="/signup" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
              Don&apos;t have an account? Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'