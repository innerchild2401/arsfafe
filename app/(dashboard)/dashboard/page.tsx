import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).status !== 'approved') {
    redirect('/pending')
  }

  const userProfile = profile as any

  // Get user's books
  const { data: books } = await supabase
    .from('user_book_access')
    .select('book_id, is_owner, books(*)')
    .eq('user_id', user.id)
    .eq('is_visible', true)
    .order('access_granted_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Welcome back!
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                {userProfile.full_name || userProfile.email}
              </p>
            </div>
            {userProfile.role === 'admin' && (
              <Link
                href="/admin"
                className="hidden sm:flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin Panel
              </Link>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Your Books</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {books?.length || 0}
              </p>
              <p className="text-xs text-gray-500">Total uploaded</p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Pages Processed</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {userProfile.pages_processed_this_month || 0}
              </p>
              {userProfile.max_pages_per_month ? (
                <p className="text-xs text-gray-500">
                  of {userProfile.max_pages_per_month} this month
                </p>
              ) : (
                <p className="text-xs text-gray-500">This month</p>
              )}
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full -mr-16 -mt-16 opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Chat Messages</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {userProfile.chat_messages_this_month || 0}
              </p>
              {userProfile.max_chat_messages_per_month ? (
                <p className="text-xs text-gray-500">
                  of {userProfile.max_chat_messages_per_month} this month
                </p>
              ) : (
                <p className="text-xs text-gray-500">This month</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/dashboard/upload"
              className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Book
            </Link>
            <Link
              href="/dashboard/knowledge-center"
              className="group flex items-center gap-3 rounded-xl bg-white px-6 py-4 text-gray-900 font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105 border-2 border-gray-200 hover:border-indigo-300"
            >
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Knowledge Center
            </Link>
            {userProfile.role === 'admin' && (
              <Link
                href="/admin"
                className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105 sm:hidden"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin Panel
              </Link>
            )}
          </div>
        </div>

        {/* Books List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Books</h2>
            <Link
              href="/dashboard/upload"
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Upload new
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          
          {books && books.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((access: any) => {
                const book = access.books
                const statusColors: Record<string, string> = {
                  'ready': 'bg-green-100 text-green-800 border-green-200',
                  'processing': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                  'failed': 'bg-red-100 text-red-800 border-red-200',
                  'pending': 'bg-gray-100 text-gray-800 border-gray-200'
                }
                return (
                  <div key={book.id} className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -mr-12 -mt-12 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative">
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[book.status] || statusColors.pending}`}>
                          {book.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-2">
                        {book.title || book.original_filename}
                      </h3>
                      {book.author && (
                        <p className="text-sm text-gray-600 mb-4">by {book.author}</p>
                      )}
                      {book.status === 'ready' && (
                        <Link
                          href={`/dashboard/knowledge-center?book=${book.id}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 group-hover:gap-3 transition-all"
                        >
                          Chat with this book
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-12 text-center shadow-lg border border-gray-100">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 mb-6">
                <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No books yet</h3>
              <p className="text-gray-600 mb-6">Upload your first book to start building your knowledge center</p>
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Your First Book
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
