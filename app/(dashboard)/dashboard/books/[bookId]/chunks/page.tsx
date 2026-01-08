"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getBackendUrl } from '@/lib/api'
import Link from 'next/link'

interface ParentChunk {
  id: string
  chapter_title: string | null
  section_title: string | null
  full_text: string
  topic_labels: string[] | null
  chunk_index: number | null
  created_at: string
}

interface ChildChunk {
  id: string
  text: string
  parent_id: string | null
  paragraph_index: number | null
  page_number: number | null
  created_at: string
  parent_chunks?: {
    chapter_title: string | null
    section_title: string | null
  } | null
}

export default function BookChunksPage() {
  const params = useParams()
  const router = useRouter()
  const bookId = params?.bookId as string
  const [parentChunks, setParentChunks] = useState<ParentChunk[]>([])
  const [childChunks, setChildChunks] = useState<ChildChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chunkType, setChunkType] = useState<'parent' | 'child' | 'all'>('all')
  const [book, setBook] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [bookId, chunkType])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      // Get book info
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get book details
      const bookResponse = await fetch(`${getBackendUrl()}/api/books/${bookId}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })

      if (!bookResponse.ok) {
        throw new Error('Failed to load book')
      }

      const bookData = await bookResponse.json()
      setBook(bookData.book)

      // Get chunks
      const chunksResponse = await fetch(`${getBackendUrl()}/api/books/${bookId}/chunks?chunk_type=${chunkType}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      })

      if (!chunksResponse.ok) {
        throw new Error('Failed to load chunks')
      }

      const chunksData = await chunksResponse.json()
      setParentChunks(chunksData.parent_chunks || [])
      setChildChunks(chunksData.child_chunks || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load chunks')
      console.error('Error loading chunks:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading chunks...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
          <Link href="/dashboard" className="text-indigo-600 hover:text-indigo-700">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-indigo-600 hover:text-indigo-700 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">
            {book?.title || 'Book Chunks'}
          </h1>
          {book?.author && (
            <p className="text-gray-600 mb-4">by {book.author}</p>
          )}
          
          {/* Chunk type selector */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setChunkType('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                chunkType === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({parentChunks.length} parent, {childChunks.length} child)
            </button>
            <button
              onClick={() => setChunkType('parent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                chunkType === 'parent'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Parent Chunks ({parentChunks.length})
            </button>
            <button
              onClick={() => setChunkType('child')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                chunkType === 'child'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Child Chunks ({childChunks.length})
            </button>
          </div>
        </div>

        {/* Parent Chunks */}
        {(chunkType === 'all' || chunkType === 'parent') && parentChunks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Parent Chunks ({parentChunks.length})
            </h2>
            <div className="space-y-4">
              {parentChunks.map((chunk, idx) => (
                <div key={chunk.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      {chunk.chapter_title && (
                        <h3 className="font-semibold text-gray-900">{chunk.chapter_title}</h3>
                      )}
                      {chunk.section_title && (
                        <p className="text-sm text-gray-600 mt-1">{chunk.section_title}</p>
                      )}
                      {chunk.topic_labels && chunk.topic_labels.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {chunk.topic_labels.map((label, i) => (
                            <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">#{idx + 1}</span>
                  </div>
                  <p className="text-gray-700 text-sm mt-2 line-clamp-3">{chunk.full_text}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {chunk.full_text.length} characters
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Child Chunks */}
        {(chunkType === 'all' || chunkType === 'child') && childChunks.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Child Chunks ({childChunks.length})
            </h2>
            <div className="space-y-3">
              {childChunks.map((chunk, idx) => (
                <div key={chunk.id} className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      {chunk.parent_chunks?.chapter_title && (
                        <p className="text-xs text-gray-500 mb-1">
                          {chunk.parent_chunks.chapter_title}
                          {chunk.parent_chunks.section_title && ` → ${chunk.parent_chunks.section_title}`}
                        </p>
                      )}
                      <p className="text-gray-700 text-sm">{chunk.text}</p>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">#{idx + 1}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-400 mt-2">
                    {chunk.paragraph_index !== null && (
                      <span>Para: {chunk.paragraph_index}</span>
                    )}
                    {chunk.page_number !== null && (
                      <span>Page: {chunk.page_number}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {parentChunks.length === 0 && childChunks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No chunks found. The book may still be processing.</p>
            <Link href="/dashboard" className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
              ← Back to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
