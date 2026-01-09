"use client"

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { FileText, Calendar, User, Hash } from 'lucide-react'

interface BookDetailsPanelProps {
  book?: {
    id: string
    title: string | null
    author: string | null
    status: string
    original_filename: string
    created_at: string
  } | null
}

export default function BookDetailsPanel({ book }: BookDetailsPanelProps) {
  if (!book) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Select a book to view details
          </p>
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="emerald">{status}</Badge>
      case 'processing':
        return <Badge variant="amber">{status}</Badge>
      case 'error':
        return <Badge variant="rose">{status}</Badge>
      default:
        return <Badge variant="violet">{status}</Badge>
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {book.title || book.original_filename}
        </h3>
        <div className="flex items-center gap-2 mb-4">
          {getStatusBadge(book.status)}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <User className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Author</p>
            <p className="text-sm text-foreground">
              {book.author || 'Unknown'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Filename</p>
            <p className="text-sm text-foreground font-mono">
              {book.original_filename}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Uploaded</p>
            <p className="text-sm text-foreground">
              {new Date(book.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Book ID</p>
            <p className="text-sm text-foreground font-mono text-xs">
              {book.id}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}