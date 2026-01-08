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
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Welcome back, {userProfile.full_name || userProfile.email}!
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Stats */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Your Books</h3>
            <p className="mt-2 text-3xl font-bold text-indigo-600">
              {books?.length || 0}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Pages Processed</h3>
            <p className="mt-2 text-3xl font-bold text-indigo-600">
              {userProfile.pages_processed_this_month || 0}
            </p>
            {userProfile.max_pages_per_month && (
              <p className="mt-1 text-sm text-gray-500">
                of {userProfile.max_pages_per_month} this month
              </p>
            )}
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Chat Messages</h3>
            <p className="mt-2 text-3xl font-bold text-indigo-600">
              {userProfile.chat_messages_this_month || 0}
            </p>
            {userProfile.max_chat_messages_per_month && (
              <p className="mt-1 text-sm text-gray-500">
                of {userProfile.max_chat_messages_per_month} this month
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4">
          <Link
            href="/dashboard/upload"
            className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Upload Book
          </Link>
          <Link
            href="/dashboard/knowledge-center"
            className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Knowledge Center
          </Link>
          {userProfile.role === 'admin' && (
            <Link
              href="/admin"
              className="rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-white hover:from-purple-700 hover:to-indigo-700 shadow-sm transition-all"
            >
              Admin Panel
            </Link>
          )}
        </div>

        {/* Books List */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900">Your Books</h2>
          {books && books.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((access: any) => {
                const book = access.books
                return (
                  <div key={book.id} className="rounded-lg bg-white p-6 shadow">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {book.title || book.original_filename}
                    </h3>
                    {book.author && (
                      <p className="mt-1 text-sm text-gray-600">by {book.author}</p>
                    )}
                    <p className="mt-2 text-sm text-gray-500">
                      Status: <span className="font-medium">{book.status}</span>
                    </p>
                    {book.status === 'ready' && (
                      <Link
                        href={`/dashboard/knowledge-center?book=${book.id}`}
                        className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        Chat with this book →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-white p-8 text-center shadow">
              <p className="text-gray-600">No books yet. Upload your first book to get started!</p>
              <Link
                href="/dashboard/upload"
                className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                Upload Book
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
