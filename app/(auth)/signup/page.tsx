"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || undefined
          }
        }
      })

      if (error) throw error

      if (data.user) {
        setSuccess(true)
        setTimeout(() => {
          router.push('/pending')
        }, 2000)
      }
    } catch (error: any) {
      setError(error.message || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-6 sm:py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">Create your account</h1>
          <p className="text-sm sm:text-base text-gray-600">Sign up to get started</p>
        </div>
        
        <form className="space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 sm:p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 sm:p-4">
              <p className="text-sm text-green-800">
                Account created! Please wait for admin approval. Redirecting...
              </p>
            </div>
          )}
          
          <div className="space-y-4 sm:space-y-5">
            <div>
              <label htmlFor="fullName" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                Full Name <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="••••••••"
              />
              <p className="mt-1.5 text-xs text-gray-500">Must be at least 6 characters</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 sm:px-6 sm:py-3 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base transition-colors"
          >
            {loading ? 'Creating account...' : success ? 'Account created!' : 'Sign up'}
          </button>

          <div className="text-center text-sm sm:text-base">
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700 transition-colors">
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
