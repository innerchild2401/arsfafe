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
    <div className="flex flex-col sm:flex-row h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Sidebar */}
      <div className="w-full sm:w-64 lg:w-72 bg-white border-b sm:border-b-0 sm:border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium mb-2 inline-flex items-center"
          >
            <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mt-2">Knowledge Center</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Book
            </label>
            <select
              value={selectedBookId || ''}
              onChange={(e) => setSelectedBookId(e.target.value || null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
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
            <div className="text-center text-sm text-gray-600 mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900 mb-2">No books available.</p>
              <Link
                href="/dashboard/upload"
                className="text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center"
              >
                Upload a book
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            {selectedBookId 
              ? books.find(b => b.id === selectedBookId)?.title || 'Chat'
              : 'Chat with All Books'}
          </h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex justify-start">
              <div className="max-w-[85%] sm:max-w-md lg:max-w-2xl xl:max-w-3xl rounded-xl px-4 py-3 shadow-sm bg-white border border-gray-200">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">Z</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Zorxido</p>
                    <p className="text-sm sm:text-base text-gray-900 leading-relaxed">
                      Hello! I&apos;m <span className="font-semibold text-indigo-600">Zorxido</span>, your AI assistant for exploring your books. 
                      I can answer questions based on the content you&apos;ve uploaded. Ask me anything about your books!
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tip: You can ask me about specific topics, concepts, or request summaries from your uploaded books.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-md lg:max-w-2xl xl:max-w-3xl rounded-xl px-4 py-3 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <p className={`whitespace-pre-wrap text-sm sm:text-base leading-relaxed ${
                  message.role === 'user' ? 'text-white' : 'text-gray-900'
                }`}>{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className={`mt-3 pt-3 border-t ${
                    message.role === 'user' ? 'border-indigo-500 border-opacity-30' : 'border-gray-200'
                  }`}>
                    <p className={`text-xs font-semibold mb-2 ${
                      message.role === 'user' ? 'text-indigo-100' : 'text-gray-700'
                    }`}>Sources:</p>
                    <ul className={`text-xs space-y-1.5 ${
                      message.role === 'user' ? 'text-indigo-100' : 'text-gray-600'
                    }`}>
                      {message.sources.map((source, i) => (
                        <li key={i} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex space-x-2">
                  <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 p-3 sm:p-4 shadow-lg">
          <form onSubmit={handleSend} className="flex gap-2 sm:gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your books..."
              disabled={loading || books.length === 0}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 sm:py-3 text-sm sm:text-base text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || books.length === 0}
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-medium text-white hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex-shrink-0"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </span>
              ) : (
                <span className="flex items-center">
                  Send
                  <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
