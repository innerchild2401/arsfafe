"use client"

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
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

  const navItems = [
    { icon: '📚', label: 'Library', path: '/dashboard', id: 'library' },
    { icon: '⚡', label: 'Quantum Chat', path: '/dashboard/knowledge-center', id: 'chat' },
    { icon: '📤', label: 'Import', path: '/dashboard/upload', id: 'upload' },
    { icon: '🧠', label: 'Memory', path: '/dashboard/books', id: 'memory' },
  ]

  // Add admin item if user is admin
  if (isAdmin) {
    navItems.push({ icon: '🛡️', label: 'Control', path: '/admin', id: 'admin' })
  }

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(path)
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* Rail Navigation */}
      <aside
        className={`
          fixed md:relative h-full z-50
          bg-zinc-900 border-r border-zinc-800
          transition-all duration-300 ease-in-out
          ${sidebarExpanded ? 'w-64' : 'w-16'}
          flex flex-col
        `}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-center border-b border-zinc-800">
          {sidebarExpanded ? (
            <span className="font-mono text-sm font-semibold text-emerald-400">ARSFAFE</span>
          ) : (
            <span className="text-xl">⚡</span>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 space-y-2">
          {navItems.map((item) => {
            const active = isActive(item.path)
            return (
              <Link
                key={item.id}
                href={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 mx-2 rounded-lg
                  transition-colors duration-200
                  ${active
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }
                `}
              >
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Menu (Bottom) */}
        <div className="border-t border-zinc-800 p-4">
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className="flex items-center gap-3 w-full px-4 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 rounded-lg transition-colors"
          >
            <span className="text-xl">🚪</span>
            {sidebarExpanded && <span className="text-sm">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  )
}