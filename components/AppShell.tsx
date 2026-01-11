"use client"

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  BookOpen, 
  MessageSquare, 
  Upload, 
  Brain, 
  Shield,
  LogOut,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import BottomNav from '@/components/BottomNav'
import ChatFAB from '@/components/ChatFAB'

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
    { icon: BookOpen, label: 'Library', path: '/dashboard', id: 'library' },
    { icon: MessageSquare, label: 'Quantum Chat', path: '/dashboard/knowledge-center', id: 'chat' },
    { icon: Upload, label: 'Import', path: '/dashboard/upload', id: 'upload' },
    { icon: Brain, label: 'Memory', path: '/dashboard/books', id: 'memory' },
  ]

  // Add admin item if user is admin
  if (isAdmin) {
    navItems.push({ icon: Shield, label: 'Control', path: '/admin', id: 'admin' })
  }

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(path)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Rail Navigation - Hidden on Mobile */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col h-full z-50 bg-card border-r border-border transition-all duration-300 ease-in-out",
          sidebarExpanded ? 'w-64' : 'w-16'
        )}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-center border-b border-border">
          {sidebarExpanded ? (
            <span className="font-mono text-sm font-semibold text-emerald-400">ARSFAFE</span>
          ) : (
            <Zap className="w-6 h-6 text-emerald-400" />
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => {
            const active = isActive(item.path)
            const Icon = item.icon
            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 text-sm",
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Menu (Bottom) */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
            }}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarExpanded && <span className="ml-3">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Mobile Chat FAB */}
      <ChatFAB />
    </div>
  )
}