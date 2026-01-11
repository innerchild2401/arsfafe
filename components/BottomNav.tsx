"use client"

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Upload, User, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BottomNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        if (profile && (profile as any).role === 'admin') {
          setIsAdmin(true)
        }
      }
    }
    checkAdmin()
  }, [supabase])

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(path)
  }

  const navItems = [
    { icon: BookOpen, label: 'Library', path: '/dashboard', id: 'library' },
    { icon: Upload, label: 'Import', path: '/dashboard/upload', id: 'upload' },
    { icon: User, label: 'Profile', path: '/dashboard', id: 'profile' }, // Using dashboard for now, can add profile page later
  ]

  // Admin link goes inside Profile for mobile (handled separately if needed)
  if (isAdmin) {
    navItems.push({ icon: Shield, label: 'Control', path: '/admin', id: 'admin' })
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800 flex justify-around items-center z-50 safe-area-inset-bottom">
      {navItems.map((item) => {
        const active = isActive(item.path)
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200",
              active
                ? 'text-emerald-400'
                : 'text-zinc-400'
            )}
          >
            <Icon className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
