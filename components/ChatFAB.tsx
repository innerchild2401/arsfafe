"use client"

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import QuantumChat from './QuantumChat'

export default function ChatFAB() {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([])  // Changed to array
  const [books, setBooks] = useState<any[]>([])
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadBooksData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

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
          
          // Auto-select all books if available
          if (readyBooks.length > 0 && selectedBookIds.length === 0) {
            setSelectedBookIds(readyBooks.map((b: any) => b.id))
          }
        }
      } catch (error) {
        console.error('Error loading books:', error)
      }
    }
    
    loadBooksData()
  }, [supabase])

  // Update selectedBookIds from URL params
  useEffect(() => {
    const bookId = searchParams.get('book')
    if (bookId && books.find((b: any) => b.id === bookId)) {
      setSelectedBookIds([bookId])
    } else if (books.length === 1 && selectedBookIds.length === 0) {
      // Auto-select if only one book available
      setSelectedBookIds([books[0].id])
    } else if (books.length > 1 && selectedBookIds.length === 0) {
      // Auto-select all books by default
      setSelectedBookIds(books.map((b: any) => b.id))
    }
  }, [searchParams, books])

  return (
    <>
      {/* Floating Action Button - Mobile Only */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed bottom-20 right-4 h-14 w-14 bg-emerald-500 rounded-full z-50 flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-colors"
        aria-label="Open chat"
      >
        <Sparkles className="w-6 h-6 text-zinc-950" />
      </button>

      {/* Chat Drawer - Mobile Only */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="h-[85vh] bg-zinc-950 border-t border-zinc-800 flex flex-col">
          <DrawerHeader className="border-b border-zinc-800 bg-zinc-900/50 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle className="text-zinc-50 font-mono text-sm">Quantum Chat</DrawerTitle>
                <DrawerDescription className="text-zinc-400 text-xs mt-1">
                  {selectedBookIds.length === 0
                    ? 'No books selected'
                    : selectedBookIds.length === 1
                      ? books.find(b => b.id === selectedBookIds[0])?.title || 'Chat with book'
                      : selectedBookIds.length === books.length
                        ? 'Chat with all books'
                        : `${selectedBookIds.length} books selected`}
                </DrawerDescription>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors ml-4 flex-shrink-0"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DrawerHeader>
          
          {/* Chat Content - flex-1 min-h-0 allows scrolling to work */}
          <div className="flex-1 min-h-0 flex flex-col">
            <QuantumChat 
              selectedBookIds={selectedBookIds} 
              books={books}
              onArtifactClick={() => setIsOpen(false)}  // Close drawer when artifact is clicked on mobile
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
