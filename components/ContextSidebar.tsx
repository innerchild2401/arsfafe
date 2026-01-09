"use client"

import { useState } from 'react'
import Link from 'next/link'

interface Book {
  id: string
  title: string | null
  original_filename: string
  status: string
}

interface ContextSidebarProps {
  books: Book[]
  selectedBookId: string | null
  onSelectBook: (bookId: string | null) => void
}

export default function ContextSidebar({ books, selectedBookId, onSelectBook }: ContextSidebarProps) {
  const [isOpen, setIsOpen] = useState(true)

  const getHealthDot = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
      case 'processing':
        return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
      default:
        return <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
    }
  }

  return (
    <aside className={`
      w-80 border-r border-zinc-800 bg-zinc-900/50
      flex flex-col
      ${isOpen ? 'block' : 'hidden'}
    `}>
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Context</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden p-1 text-zinc-500 hover:text-zinc-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* All Knowledge Base Option */}
        <button
          onClick={() => onSelectBook(null)}
          className={`
            w-full text-left px-3 py-2 rounded-lg transition-colors
            ${selectedBookId === null
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }
          `}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
            <span className="text-sm font-medium">All Knowledge Base</span>
          </div>
        </button>

        {/* Book List */}
        {books.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 mb-4">
              <span className="text-xl">📚</span>
            </div>
            <p className="text-sm font-medium text-zinc-400 mb-2">No books available</p>
            <p className="text-xs text-zinc-500 mb-4">Upload your first book to get started</p>
            <Link
              href="/dashboard/upload"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Import a book
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {books.map((book) => (
              <button
                key={book.id}
                onClick={() => onSelectBook(book.id)}
                className={`
                  w-full text-left px-3 py-2 rounded-lg transition-colors
                  ${selectedBookId === book.id
                    ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {getHealthDot(book.status)}
                  <span className="text-sm truncate flex-1">
                    {book.title || book.original_filename}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}