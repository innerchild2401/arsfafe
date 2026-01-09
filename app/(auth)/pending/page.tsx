"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PendingPage() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const checkStatus = async () => {
    const supabase = createClient()
    try {
      setLoading(true)
      setError(null)
      
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      await supabase.auth.refreshSession()

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('status, role')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Profile error:', profileError)
        setError('Failed to load profile')
        return
      }

      if (profile) {
        const statusValue = (profile as any).status as string
        setStatus(statusValue)
        
        if (statusValue === 'approved') {
          setTimeout(() => {
            router.push('/dashboard')
            router.refresh()
          }, 500)
        }
      }
    } catch (error: any) {
      console.error('Error checking status:', error)
      setError(error.message || 'Failed to check status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
    
    // Check status every 5 seconds
    const interval = setInterval(checkStatus, 5000)
    
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="relative inline-block mb-6">
            {/* Radar/Scan Animation */}
            <div className="relative w-24 h-24 mx-auto radar-scan">
              <div className="absolute inset-0 rounded-full border-2 border-amber-500/30"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></div>
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-zinc-50 mb-2">
            Scanning for Admin clearance...
          </h2>
          <p className="text-sm text-zinc-400">
            Your account is waiting for approval. This page will automatically update when approved.
          </p>
          
          {error && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}
          
          <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Status</p>
            <p className={`text-lg font-semibold font-mono ${
              status === 'approved' ? 'text-emerald-400' : 
              status === 'rejected' ? 'text-rose-400' : 
              'text-amber-400'
            }`}>
              {status ? status.toUpperCase() : 'PENDING'}
            </p>
          </div>
          
          {status === 'approved' && (
            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <p className="text-sm font-medium text-emerald-400 mb-3">
                ✓ Your account has been approved!
              </p>
              <p className="text-xs text-zinc-400">Redirecting to dashboard...</p>
            </div>
          )}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleSignOut}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'