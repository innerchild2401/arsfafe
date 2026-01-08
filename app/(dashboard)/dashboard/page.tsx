import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 lg:mb-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600">
            {userProfile.full_name || userProfile.email}
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8 lg:mb-10">
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Your Books</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900">{books?.length || 0}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Pages Processed</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900">
                  {userProfile.pages_processed_this_month || 0}
                </p>
                {userProfile.max_pages_per_month ? (
                  <p className="text-xs text-gray-500 mt-1">of {userProfile.max_pages_per_month} this month</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">This month</p>
                )}
              </div>
              <div className="p-2.5 sm:p-3 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:border-gray-300 transition-colors sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Chat Messages</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900">
                  {userProfile.chat_messages_this_month || 0}
                </p>
                {userProfile.max_chat_messages_per_month ? (
                  <p className="text-xs text-gray-500 mt-1">of {userProfile.max_chat_messages_per_month} this month</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">This month</p>
                )}
              </div>
              <div className="p-2.5 sm:p-3 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6 sm:mb-8 lg:mb-10 flex flex-wrap gap-3 sm:gap-4">
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-sm sm:text-base font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Book
          </Link>
          <Link
            href="/dashboard/knowledge-center"
            className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors text-sm sm:text-base font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Knowledge Center
          </Link>
          {userProfile.role === 'admin' && (
            <Link
              href="/admin"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors text-sm sm:text-base font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin Panel
            </Link>
          )}
        </div>

        {/* Books */}
        <section>
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">Your Books</h2>
            <Link
              href="/dashboard/upload"
              className="text-sm sm:text-base font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Upload new
            </Link>
          </div>
          
          {books && books.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {books.map((access: any) => {
                const book = access.books
                return (
                  <div key={book.id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:border-gray-300 transition-colors">
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="p-2.5 sm:p-3 bg-gray-100 rounded-lg">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        book.status === 'ready' ? 'bg-green-50 text-green-700 border-green-200' :
                        book.status === 'processing' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {book.status}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
                      {book.title || book.original_filename}
                    </h3>
                    {book.author && (
                      <p className="text-sm text-gray-600 mb-3 sm:mb-4">by {book.author}</p>
                    )}
                    {book.status === 'ready' && (
                      <Link
                        href={`/dashboard/knowledge-center?book=${book.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        Chat with this book
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-8 sm:p-12 lg:p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 mb-4 sm:mb-6">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No books yet</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Upload your first book to get started</p>
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-sm sm:text-base font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Your First Book
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
