import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LibraryGrid from '@/components/LibraryGrid'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).status !== 'approved') {
    redirect('/pending')
  }

  const userProfile = profile as any

  const { data: books } = await supabase
    .from('user_book_access')
    .select('book_id, is_owner, books(*)')
    .eq('user_id', user.id)
    .eq('is_visible', true)
    .order('access_granted_at', { ascending: false })

  // Calculate stats
  const readyBooks = books?.filter((access: any) => access.books?.status === 'ready').length || 0
  const totalPages = userProfile.pages_processed_this_month || 0
  const maxPages = userProfile.max_pages_per_month
  const creditsPercent = maxPages ? Math.round((totalPages / maxPages) * 100) : null

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Status Bar - The Knowledge Cockpit Design */}
      <div className="h-10 border-b border-zinc-800 bg-zinc-900/50 flex items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-6 text-xs font-mono text-zinc-400">
          <span>
            <span className="text-emerald-400">Ready:</span> {readyBooks} Books
          </span>
          <span>
            <span className="text-amber-400">Processed:</span> {totalPages.toLocaleString()} Pages
          </span>
          {creditsPercent !== null && (
            <span>
              <span className="text-violet-400">Credits:</span> {creditsPercent}%
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-full px-6 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-zinc-50 mb-1">Library</h1>
            <p className="text-sm text-zinc-400">
              {userProfile.full_name || userProfile.email}
            </p>
          </div>

          <LibraryGrid books={books || []} />
        </div>
      </div>
    </div>
  )
}