"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import LibraryPanel from '@/components/LibraryPanel'
import BookDetailsPanel from '@/components/BookDetailsPanel'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Plus, MessageSquare, Eye, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Book {
  id: string
  title: string | null
  author: string | null
  status: string
  original_filename: string
  created_at: string
}

interface BookAccess {
  book_id: string
  is_owner: boolean
  books: Book
}

export default function DashboardPage() {
  const [books, setBooks] = useState<BookAccess[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    readyBooks: 0,
    totalPages: 0,
    creditsPercent: null as number | null
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (!profile || (profile as any).status !== 'approved') {
          router.push('/pending')
          return
        }

        const { data: booksData } = await supabase
          .from('user_book_access')
          .select('book_id, is_owner, books(*)')
          .eq('user_id', user.id)
          .eq('is_visible', true)
          .order('access_granted_at', { ascending: false })

        if (booksData) {
          setBooks(booksData as BookAccess[])
          
          const readyBooks = booksData.filter((access: any) => access.books?.status === 'ready').length
          const totalPages = (profile as any).pages_processed_this_month || 0
          const maxPages = (profile as any).max_pages_per_month
          const creditsPercent = maxPages ? Math.round((totalPages / maxPages) * 100) : null

          setStats({
            readyBooks,
            totalPages,
            creditsPercent
          })

          // Auto-select first book if available
          if (booksData.length > 0 && !selectedBookId) {
            setSelectedBookId((booksData[0] as BookAccess).books.id)
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supabase, router, selectedBookId])

  const selectedBook = books.find(access => access.books.id === selectedBookId)?.books || null

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Left Panel - Library List */}
      <div className="w-80 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Library</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.readyBooks} ready • {stats.totalPages.toLocaleString()} pages
            </p>
          </div>
          <Link href="/dashboard/upload">
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <Plus className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <LibraryPanel 
          books={books} 
          selectedBookId={selectedBookId}
          onSelectBook={setSelectedBookId}
        />
      </div>

      {/* Center Panel - Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 flex-shrink-0">
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span>
              <span className="text-emerald-400">Ready:</span> {stats.readyBooks} Books
            </span>
            <span>
              <span className="text-amber-400">Processed:</span> {stats.totalPages.toLocaleString()} Pages
            </span>
            {stats.creditsPercent !== null && (
              <span>
                <span className="text-violet-400">Credits:</span> {stats.creditsPercent}%
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {selectedBook ? (
            <div className="p-6 max-w-4xl">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {selectedBook.title || selectedBook.original_filename}
                </h1>
                {selectedBook.author && (
                  <p className="text-sm text-muted-foreground mb-4">
                    by {selectedBook.author}
                  </p>
                )}
              </div>

              <Separator className="mb-6" />

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {selectedBook.status === 'ready' && (
                    <>
                      <Link href={`/dashboard/knowledge-center?book=${selectedBook.id}`}>
                        <Button>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Chat with Book
                        </Button>
                      </Link>
                      <Link href={`/dashboard/books/${selectedBook.id}/chunks`}>
                        <Button variant="outline">
                          <Eye className="w-4 h-4 mr-2" />
                          View Chunks
                        </Button>
                      </Link>
                    </>
                  )}
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Select a book from the left panel to view details
                </p>
                <Link href="/dashboard/upload">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Import Your First Book
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Book Details */}
      <div className="w-96 border-l border-border bg-card flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Details</h2>
        </div>
        <BookDetailsPanel book={selectedBook} />
      </div>
    </div>
  )
}