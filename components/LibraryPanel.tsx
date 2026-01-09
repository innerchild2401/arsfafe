"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  BookOpen, 
  FileText, 
  AlertCircle, 
  Loader2
} from 'lucide-react'

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

interface LibraryPanelProps {
  books: BookAccess[]
  selectedBookId?: string | null
  onSelectBook?: (bookId: string) => void
}

export default function LibraryPanel({ books, selectedBookId, onSelectBook }: LibraryPanelProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <BookOpen className="w-4 h-4 text-emerald-400" />
      case 'processing':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-400" />
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="emerald" className="text-xs">{status}</Badge>
      case 'processing':
        return <Badge variant="amber" className="text-xs">{status}</Badge>
      case 'error':
        return <Badge variant="rose" className="text-xs">{status}</Badge>
      default:
        return <Badge variant="violet" className="text-xs">{status}</Badge>
    }
  }

  if (books.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-4">No books yet</p>
          <Link href="/dashboard/upload">
            <Button size="sm">Import Book</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-2 space-y-1">
        {books.map((access) => {
          const book = access.books
          const isSelected = selectedBookId === book.id
          
          return (
            <div
              key={book.id}
              onClick={() => onSelectBook?.(book.id)}
              className={`
                group relative p-3 rounded-lg cursor-pointer transition-colors
                ${isSelected 
                  ? 'bg-accent border border-border' 
                  : 'hover:bg-accent/50'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(book.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-medium text-foreground truncate">
                      {book.title || book.original_filename}
                    </h3>
                  </div>
                  {book.author && (
                    <p className="text-xs text-muted-foreground mb-2 truncate">
                      {book.author}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {getStatusBadge(book.status)}
                  </div>
                </div>
              </div>
              
            </div>
          )
        })}
      </div>
    </div>
  )
}