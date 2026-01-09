"use client"

import { useState } from 'react'
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

interface LibraryGridProps {
  books: BookAccess[]
}

export default function LibraryGrid({ books }: LibraryGridProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="text-emerald-400">●</span>
      case 'processing':
        return <span className="text-amber-400 animate-pulse">●</span>
      case 'error':
        return <span className="text-rose-400">●</span>
      default:
        return <span className="text-zinc-500">○</span>
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'badge-emerald'
      case 'processing':
        return 'badge-amber'
      case 'error':
        return 'badge-rose'
      default:
        return 'badge-violet'
    }
  }

  if (books.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-900 mb-4">
          <span className="text-2xl">📚</span>
        </div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-2">No books yet</h3>
        <p className="text-sm text-zinc-400 mb-6">Upload your first book to get started</p>
        <Link
          href="/dashboard/upload"
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors text-sm font-medium"
        >
          <span>📤</span>
          Import Book
        </Link>
      </div>
    )
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-zinc-900/50 border-b border-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Author
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Chunks
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Last Chat
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {books.map((access) => {
              const book = access.books
              const isHovered = hoveredRow === book.id
              
              return (
                <tr
                  key={book.id}
                  className="hover:bg-zinc-900/50 transition-colors"
                  onMouseEnter={() => setHoveredRow(book.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(book.status)}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(book.status)}`}>
                        {book.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-zinc-50">
                      {book.title || book.original_filename}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-zinc-400">
                      {book.author || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-mono text-zinc-400">
                      {/* TODO: Fetch actual chunk count */}
                      —
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-mono text-zinc-500">
                      {/* TODO: Fetch last chat time */}
                      —
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center justify-end gap-2 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                      {book.status === 'ready' && (
                        <>
                          <Link
                            href={`/dashboard/knowledge-center?book=${book.id}`}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-50 bg-emerald-500/20 border border-emerald-500/30 rounded hover:bg-emerald-500/30 transition-colors"
                          >
                            Chat
                          </Link>
                          <Link
                            href={`/dashboard/books/${book.id}/chunks`}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-50 bg-violet-500/20 border border-violet-500/30 rounded hover:bg-violet-500/30 transition-colors"
                          >
                            Inspect
                          </Link>
                        </>
                      )}
                      <button
                        className="px-3 py-1.5 text-xs font-medium text-zinc-50 bg-rose-500/20 border border-rose-500/30 rounded hover:bg-rose-500/30 transition-colors"
                        onClick={() => {
                          // TODO: Implement delete
                          if (confirm('Delete this book?')) {
                            // Delete logic
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}