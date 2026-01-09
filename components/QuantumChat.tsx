"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBackendUrl } from '@/lib/api'
import ZorxidoOrb from './ZorxidoOrb'
import CitationTooltip from './CitationTooltip'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  timestamp?: Date
}

interface QuantumChatProps {
  selectedBookId: string | null
  books: any[]
}

export default function QuantumChat({ selectedBookId, books }: QuantumChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

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

  // Parse citations from content (format: [Ref: 1], [Ref: 2], etc.)
  const parseCitations = (content: string, sources?: string[]): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    const citationRegex = /\[Ref:\s*(\d+)\]/g
    let lastIndex = 0
    let match

    while ((match = citationRegex.exec(content)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index))
      }
      
      // Add citation tooltip
      const refNum = parseInt(match[1])
      const sourceText = sources && sources[refNum - 1] ? sources[refNum - 1] : 'Source not available'
      parts.push(
        <CitationTooltip
          key={`citation-${match.index}`}
          refNumber={refNum}
          text={sourceText}
        />
      )
      
      lastIndex = match.index + match[0].length
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex))
    }
    
    return parts.length > 0 ? parts : [content]
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Messages Area - Thread Style */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {messages.length === 0 && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center max-w-lg">
                <ZorxidoOrb size="lg" />
                <h2 className="mt-6 text-xl font-semibold text-zinc-50 mb-2">How can I help you today?</h2>
                <p className="text-sm text-zinc-400">I&apos;m Zorxido, your AI assistant. Ask me anything about your books.</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <ZorxidoOrb isActive={index === messages.length - 1 && loading} size="md" />
                  </div>
                )}
                
                <div className={`flex-1 ${message.role === 'user' ? 'max-w-[75%]' : 'max-w-[85%]'}`}>
                  {message.role === 'user' ? (
                    <div className="text-zinc-200 text-sm leading-relaxed">
                      {message.content}
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Vertical accent line */}
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/50" />
                      
                      {/* Content */}
                      <div className="ml-4 pl-4 bg-zinc-900/50 rounded-lg p-4 border-l-2 border-emerald-500/30">
                        <div className="font-serif text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">
                          {parseCitations(message.content, message.sources)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                    <span className="text-zinc-400 text-xs font-medium">U</span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-4 justify-start">
                <div className="flex-shrink-0">
                  <ZorxidoOrb isActive={true} size="md" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  <div className="ml-4 pl-4 bg-zinc-900/50 rounded-lg p-4 border-l-2 border-emerald-500/30">
                    <div className="space-y-2">
                      <div className="h-4 bg-zinc-800 rounded shimmer w-3/4" />
                      <div className="h-4 bg-zinc-800 rounded shimmer w-1/2" />
                      <div className="h-4 bg-zinc-800 rounded shimmer w-5/6" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 max-w-md">
                  <p className="text-sm text-rose-400">{error}</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="border-t border-zinc-800 bg-zinc-900/50 px-6 py-4 flex-shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-3">
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
              className="flex-1 resize-none bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '200px', overflowY: 'auto' }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || books.length === 0}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-center text-zinc-500">
            Zorxido can make mistakes. Check important information.
          </p>
        </form>
      </div>
    </div>
  )
}