"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  timestamp?: Date
}

export default function KnowledgeCenterPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [books, setBooks] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
          
          // Auto-select if only one book
          if (readyBooks.length === 1 && !selectedBookId) {
            setSelectedBookId(readyBooks[0].id)
          }
        }
      } catch (error) {
        console.error('Error loading books:', error)
      }
    }
    
    loadBooksData()
    
    // Check for book ID in URL
    const bookId = searchParams.get('book')
    if (bookId) {
      setSelectedBookId(bookId)
    }
  }, [searchParams, supabase, router, selectedBookId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadChatHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) return

      const response = await fetch(
        `${backendUrl}/api/chat/history${selectedBookId ? `?book_id=${selectedBookId}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        const formattedMessages = data.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          sources: msg.sources,
          timestamp: new Date(msg.created_at)
        }))
        setMessages(formattedMessages.reverse())
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
  }

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) return

        const response = await fetch(
          `${backendUrl}/api/chat/history${selectedBookId ? `?book_id=${selectedBookId}` : ''}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          const formattedMessages = data.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            sources: msg.sources,
            timestamp: new Date(msg.created_at)
          }))
          setMessages(formattedMessages.reverse())
        }
      } catch (error) {
        console.error('Error loading chat history:', error)
      }
    }

    if (selectedBookId || books.length > 0) {
      loadHistory()
    }
  }, [selectedBookId, books.length, supabase])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || loading) return

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          book_id: selectedBookId || null
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Chat failed' }))
        throw new Error(errorData.detail || `Chat failed: ${response.statusText}`)
      }

      const data = await response.json()

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        sources: data.sources,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
      
    } catch (error: any) {
      setError(error.message || 'Failed to send message')
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-700 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h2 className="text-lg font-semibold text-gray-900">Knowledge Center</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Book
            </label>
            <select
              value={selectedBookId || ''}
              onChange={(e) => setSelectedBookId(e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            >
              <option value="">All Books</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title || book.original_filename}
                </option>
              ))}
            </select>
          </div>

          {books.length === 0 && (
            <div className="text-center text-sm text-gray-500 mt-8">
              <p>No books available.</p>
              <Link
                href="/dashboard/upload"
                className="text-indigo-600 hover:text-indigo-700 mt-2 inline-block"
              >
                Upload a book →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <h1 className="text-xl font-semibold text-gray-900">
            {selectedBookId 
              ? books.find(b => b.id === selectedBookId)?.title || 'Chat'
              : 'Chat with All Books'}
          </h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Ask questions about your books</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-300">
                    <p className="text-xs font-semibold mb-1">Sources:</p>
                    <ul className="text-xs space-y-1">
                      {message.sources.map((source, i) => (
                        <li key={i} className="opacity-80">• {source}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 p-4">
          <form onSubmit={handleSend} className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your books..."
              disabled={loading || books.length === 0}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || books.length === 0}
              className="rounded-md bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
