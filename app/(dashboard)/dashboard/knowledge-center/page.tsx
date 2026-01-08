"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getBackendUrl } from '@/lib/api'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
          
          if (readyBooks.length === 1 && !selectedBookId) {
            setSelectedBookId(readyBooks[0].id)
          }
        }
      } catch (error) {
        console.error('Error loading books:', error)
      }
    }
    
    loadBooksData()
    
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

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const backendUrl = getBackendUrl()
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

      const backendUrl = getBackendUrl()

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
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full bg-white text-gray-900 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto
        w-72 md:w-80 lg:w-96
        bg-white border-r border-gray-200
        transform transition-transform duration-300 ease-in-out
        flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Link>
            <h2 className="text-base md:text-lg font-semibold text-gray-900">Knowledge Center</h2>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label htmlFor="book-select" className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
              Select Book
            </label>
            <select
              id="book-select"
              value={selectedBookId || ''}
              onChange={(e) => setSelectedBookId(e.target.value || null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
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
            <div className="text-center py-12 px-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-2">No books available</p>
              <p className="text-xs text-gray-500 mb-4">Upload your first book to get started</p>
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Upload a book
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Open sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-base md:text-lg font-semibold text-gray-900 truncate">
              {selectedBookId 
                ? books.find(b => b.id === selectedBookId)?.title || 'Chat'
                : 'Chat with All Books'}
            </h1>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-3xl xl:max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-8">
            {messages.length === 0 && (
              <div className="flex items-center justify-center min-h-[60vh] md:min-h-[70vh]">
                <div className="text-center max-w-lg px-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-100 mb-4 md:mb-6">
                    <svg className="w-8 h-8 md:w-10 md:h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h2 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2">How can I help you today?</h2>
                  <p className="text-sm md:text-base text-gray-600">I&apos;m Zorxido, your AI assistant. Ask me anything about your books.</p>
                </div>
              </div>
            )}

            <div className="space-y-4 md:space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 md:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                  )}
                  
                  <div className={`flex-1 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[65%] ${message.role === 'user' ? 'flex flex-col items-end' : ''}`}>
                      <div className={`
                        rounded-2xl px-4 py-3 md:px-5 md:py-4
                        ${message.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }
                      `}>
                        <p className={`whitespace-pre-wrap text-sm md:text-[15px] leading-7 ${message.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
                          {message.content}
                        </p>
                      </div>
                      {message.sources && message.sources.length > 0 && (
                        <div className={`mt-2 px-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p className="font-medium text-gray-600">Sources:</p>
                            {message.sources.map((source, i) => (
                              <p key={i} className="text-gray-500">• {source}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs md:text-sm font-medium">U</span>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 md:gap-4 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 md:px-5 md:py-4 max-w-[85%] sm:max-w-[75%]">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-center">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-md">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
          <form onSubmit={handleSend} className="max-w-3xl xl:max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 md:gap-3 rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 transition-all">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = `${Math.min(target.scrollHeight, 200)}px`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e as any)
                  }
                }}
                placeholder="Message Zorxido..."
                disabled={loading || books.length === 0}
                rows={1}
                className="flex-1 resize-none border-0 px-3 py-2.5 md:px-4 md:py-3 text-sm md:text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed bg-transparent"
                style={{ minHeight: '44px', maxHeight: '200px', overflowY: 'auto' }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || books.length === 0}
                className="mb-1.5 md:mb-2 mr-1.5 md:mr-2 flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                aria-label="Send message"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-center text-gray-500">
              Zorxido can make mistakes. Check important information.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
