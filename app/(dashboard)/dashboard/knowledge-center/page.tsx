"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import QuantumChat from '@/components/QuantumChat'
import ContextSidebar from '@/components/ContextSidebar'
import { Sparkles } from 'lucide-react'

export default function KnowledgeCenterPage() {
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([])  // Changed to array
  const [books, setBooks] = useState<any[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const loadBooksData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: booksData } = await supabase
          .from('user_book_access')
          .select('book_id, books(*)')
          .eq('user_id', user.id)
          .eq('is_visible', true)

        if (booksData) {
          const readyBooks = booksData
            .map((access: any) => access.books)
            .filter((book: any) => book && book.status === 'ready')
          
          setBooks(readyBooks)
          
          // Auto-select all books if only one book available
          if (readyBooks.length === 1 && selectedBookIds.length === 0) {
            setSelectedBookIds([readyBooks[0].id])
          } else if (readyBooks.length > 1 && selectedBookIds.length === 0) {
            // Auto-select all books by default
            setSelectedBookIds(readyBooks.map((b: any) => b.id))
          }
        }
      } catch (error) {
        console.error('Error loading books:', error)
      }
    }
    
    loadBooksData()
    
    const bookId = searchParams.get('book')
    if (bookId) {
      setSelectedBookIds([bookId])
    }
  }, [searchParams, supabase, router])

  return (
    <div className="flex h-full bg-zinc-950 min-h-0">
      {/* Context Sidebar - Desktop Only (Hidden on Mobile) */}
      <div className="hidden md:block md:relative flex-shrink-0">
        <ContextSidebar
          books={books}
          selectedBookIds={selectedBookIds}
          onSelectBook={(bookId) => {
            setSelectedBookIds(prev => 
              prev.includes(bookId) 
                ? prev.filter(id => id !== bookId)
                : [...prev, bookId]
            )
          }}
          onSelectAll={() => {
            if (selectedBookIds.length === books.length) {
              setSelectedBookIds([])  // Deselect all
            } else {
              setSelectedBookIds(books.map(b => b.id))  // Select all
            }
          }}
        />
      </div>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header - Desktop Only */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <h1 className="text-base font-semibold text-zinc-50 truncate">
            {selectedBookIds.length === 0
              ? 'No books selected'
              : selectedBookIds.length === 1
                ? books.find(b => b.id === selectedBookIds[0])?.title || 'Quantum Chat'
                : selectedBookIds.length === books.length
                  ? 'All Knowledge Base'
                  : `${selectedBookIds.length} books selected`}
          </h1>
        </header>

        {/* Chat Component - Desktop Only */}
        <div className="hidden md:block flex-1 min-h-0">
          <QuantumChat selectedBookIds={selectedBookIds} books={books} />
        </div>

        {/* Mobile: Empty state with FAB visible */}
        <div className="md:hidden flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="mb-4">
              <Sparkles className="w-12 h-12 text-emerald-500 mx-auto" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-50 mb-2">Ready to chat?</h2>
            <p className="text-sm text-zinc-400 mb-6">Tap the button below to start a conversation</p>
          </div>
        </div>
      </main>
    </div>
  )
}