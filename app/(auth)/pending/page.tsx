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

      // Force refresh the session
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
        const roleValue = (profile as any).role as string
        setStatus(statusValue)
        
        if (statusValue === 'approved') {
          // Small delay to show the updated status
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


  const handleRefresh = () => {
    checkStatus()
  }

  const handleGoToDashboard = () => {
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-6 sm:p-8 shadow-lg border border-gray-200 text-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Account Pending Approval
          </h2>
          <p className="mt-4 text-base text-gray-600">
            Your account has been created and is waiting for admin approval.
          </p>
          
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-1">Current Status:</p>
            <p className={`text-lg font-bold ${
              status === 'approved' ? 'text-green-600' : 
              status === 'rejected' ? 'text-red-600' : 
              'text-yellow-600'
            }`}>
              {status ? status.toUpperCase() : 'PENDING'}
            </p>
          </div>
          
          {status === 'approved' && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm font-medium text-green-800 mb-3">
                ✓ Your account has been approved!
              </p>
              <button
                onClick={handleGoToDashboard}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
          
          {status !== 'approved' && (
            <p className="mt-4 text-sm text-gray-500">
              This page will automatically refresh when your account is approved.
            </p>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Checking...' : 'Refresh Status'}
          </button>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
        
        {loading && status !== 'approved' && (
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
          </div>
        )}
      </div>
    </div>
  )
}
