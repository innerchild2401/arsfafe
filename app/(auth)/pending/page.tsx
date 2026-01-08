"use client"

"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PendingPage() {
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('status')
          .eq('id', user.id)
          .single()

        if (profile && !profileError) {
          const statusValue = (profile as any).status as string
          setStatus(statusValue)
          
          if (statusValue === 'approved') {
            router.push('/dashboard')
          }
        }
      } catch (error) {
        console.error('Error checking status:', error)
      }
    }
    
    checkStatus()
    
    // Check status every 5 seconds
    const interval = setInterval(checkStatus, 5000)
    
    return () => clearInterval(interval)
  }, [router])


  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md text-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Account Pending Approval
          </h2>
          <p className="mt-4 text-gray-600">
            Your account has been created and is waiting for admin approval.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Status: <span className="font-semibold">{status || 'pending'}</span>
          </p>
          <p className="mt-4 text-sm text-gray-500">
            This page will automatically refresh when your account is approved.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      </div>
    </div>
  )
}
