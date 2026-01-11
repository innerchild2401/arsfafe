"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBackendUrl } from '@/lib/api'
import ZorxidoOrb from './ZorxidoOrb'
import CitationTooltip from './CitationTooltip'
import ChunkViewerPanel from './ChunkViewerPanel'

interface Message {
  id?: string  // Message ID from database (for refinement)
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  retrieved_chunks?: string[]  // Chunk UUIDs
  chunk_map?: Record<string, string>  // persistent_id -> chunk_uuid mapping
  timestamp?: Date
  artifact?: {
    artifact_type: 'checklist' | 'notebook' | 'script'
    title: string
    content: any
    citations?: string[]
    variables?: Record<string, string>
  } | null
}

interface QuantumChatProps {
  selectedBookId: string | null
  books: any[]
  onArtifactClick?: () => void  // Callback for mobile drawer to close when artifact is clicked
}

interface ChunkData {
  id: string
  text: string
  paragraph_index: number | null
  page_number: number | null
  parent_context: {
    id: string
    full_text: string
    chapter_title: string | null
    section_title: string | null
    topic_labels: string[] | null
    concise_summary: string | null
  } | null
  book: {
    id: string
    title: string
    author: string | null
  } | null
}

export default function QuantumChat({ selectedBookId, books, onArtifactClick }: QuantumChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null)
  const [chunkData, setChunkData] = useState<ChunkData | null>(null)
  const [chunkLoading, setChunkLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [thinkingStep, setThinkingStep] = useState<string | null>(null)
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
            id: msg.id,  // Store message ID for refinement
            role: msg.role,
            content: msg.content,
            sources: msg.sources,
            retrieved_chunks: msg.retrieved_chunks || [],
            chunk_map: msg.chunk_map || {},  // Load chunk_map from stored messages if available
            artifact: msg.artifact || null,  // Load artifact from stored messages if available
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
    setThinkingStep(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const backendUrl = getBackendUrl()

      // Use streaming endpoint
      const response = await fetch(`${backendUrl}/api/chat/stream`, {
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

      // Create assistant message placeholder
      const assistantMessageId = Date.now()
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        sources: [],
        retrieved_chunks: [],
        chunk_map: {},
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

      // Stream response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let finalSources: string[] = []
      let finalChunkMap: Record<string, string> = {}
      let finalArtifact: Message['artifact'] = null

      if (!reader) {
        throw new Error('No response body')
      }

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line)

            switch (event.type) {
              case 'thinking':
                setThinkingStep(event.step)
                break

              case 'token':
                fullContent += event.content
                // Update message content in real-time
                setMessages(prev => prev.map((msg, idx) => 
                  idx === prev.length - 1 && msg.role === 'assistant'
                    ? { ...msg, content: fullContent }
                    : msg
                ))
                break

              case 'citation':
                // Citations are already in the content stream, this is just for logging
                // The citation parsing happens in parseCitations function
                break

              case 'artifact':
                // Path D: Structured artifact received
                finalArtifact = event.artifact
                // Update message with artifact
                setMessages(prev => prev.map((msg, idx) => 
                  idx === prev.length - 1 && msg.role === 'assistant'
                    ? { ...msg, artifact: finalArtifact }
                    : msg
                ))
                break

              case 'done':
                finalSources = event.sources || []
                finalChunkMap = event.chunk_map || {}
                // Update message with final metadata (preserve artifact if already set)
                setMessages(prev => prev.map((msg, idx) => 
                  idx === prev.length - 1 && msg.role === 'assistant'
                    ? { 
                        ...msg, 
                        content: fullContent,
                        sources: finalSources,
                        chunk_map: finalChunkMap,
                        retrieved_chunks: event.retrieved_chunks || [],
                        artifact: msg.artifact || finalArtifact  // Preserve artifact if already set
                      }
                    : msg
                ))
                break

              case 'error':
                throw new Error(event.message || 'Streaming error')
            }
          } catch (parseError) {
            console.error('Error parsing stream event:', parseError, line)
          }
        }
      }

      setThinkingStep(null)
      
    } catch (error: any) {
      setError(error.message || 'Failed to send message')
      setMessages(prev => prev.slice(0, -1))
      setThinkingStep(null)
    } finally {
      setLoading(false)
    }
  }

  // Fetch chunk data by ID
  const fetchChunkData = async (chunkId: string) => {
    try {
      setChunkLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const backendUrl = getBackendUrl()
      // Use the chunks endpoint under books router
      const response = await fetch(`${backendUrl}/api/books/chunks/${chunkId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch chunk')
      }

      const data = await response.json()
      setChunkData(data.chunk)
      setPanelOpen(true)
    } catch (error: any) {
      console.error('Error fetching chunk:', error)
      setError(error.message || 'Failed to load chunk')
    } finally {
      setChunkLoading(false)
    }
  }

  // Handle citation click
  const handleCitationClick = (chunkId: string) => {
    setSelectedChunkId(chunkId)
    fetchChunkData(chunkId)
  }

  // Close panel
  const handleClosePanel = () => {
    setPanelOpen(false)
    setSelectedChunkId(null)
    setChunkData(null)
  }

  // Parse citations from content (format: #chk_xxxx)
  const parseCitations = (
    content: string, 
    message: Message,
    sources?: string[]
  ): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    // Match #chk_ followed by 8 hex characters (case-insensitive, with word boundary check)
    // Use a non-global regex first to find all matches, then process them
    const citationMatches: Array<{ match: string; index: number }> = []
    const citationRegex = /#chk_[a-f0-9]{8}/gi
    let match
    
    // Find all matches first
    while ((match = citationRegex.exec(content)) !== null) {
      citationMatches.push({ match: match[0], index: match.index })
    }
    
    // Reset regex for processing
    citationRegex.lastIndex = 0
    
    // Process each citation
    let lastIndex = 0
    for (const { match: citationText, index } of citationMatches) {
      // Add text before citation
      if (index > lastIndex) {
        parts.push(content.substring(lastIndex, index))
      }
      
      // Get persistent ID and find corresponding chunk UUID
      const persistentId = citationText
      const chunkMap = message.chunk_map || {}
      const chunkId = chunkMap[persistentId]
      
      // Extract chunk text snippet from content (text after citation until next citation or ~200 chars)
      const citationEnd = index + citationText.length
      const remainingMatches = citationMatches.filter(m => m.index > index)
      const nextCitation = remainingMatches.length > 0 ? remainingMatches[0] : null
      const nextCitationIndex = nextCitation ? nextCitation.index : undefined
      const textEnd = nextCitationIndex !== undefined
        ? Math.min(nextCitationIndex, citationEnd + 200)
        : Math.min(citationEnd + 200, content.length)
      
      // Get the chunk text snippet
      let chunkTextSnippet = content.substring(citationEnd, textEnd).trim()
      // Clean up: remove any citation IDs that appear, remove extra whitespace
      chunkTextSnippet = chunkTextSnippet.replace(/#chk_[a-f0-9]{8}/gi, '').trim()
      chunkTextSnippet = chunkTextSnippet.replace(/\s+/g, ' ')
      // Truncate to 200 chars for preview
      if (chunkTextSnippet.length > 200) {
        chunkTextSnippet = chunkTextSnippet.substring(0, 200) + '...'
      }
      
      // Use snippet if available, otherwise generic message
      const chunkText = chunkTextSnippet || 'Click to view full chunk context and source information.'
      const sourceText = sources && sources.length > 0 ? sources.join(', ') : 'Source available'
      
      parts.push(
        <CitationTooltip
          key={`citation-${index}`}
          persistentId={persistentId}
          chunkText={chunkText}
          source={sourceText}
          chunkId={chunkId}
          onCitationClick={chunkId ? handleCitationClick : undefined}
        />
      )
      
      lastIndex = index + citationText.length
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex))
    }
    
    return parts.length > 0 ? parts : [content]
  }

  return (
    <div className="flex flex-1 h-full bg-zinc-950 overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
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
                        <div className="ml-4 pl-4 bg-zinc-900/50 rounded-lg p-4 border-l-2 border-emerald-500/30 space-y-3">
                          <div className="font-serif text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">
                            {parseCitations(message.content, message, message.sources)}
                          </div>
                          
                          {/* View Artifact Card (Path D) */}
                          {message.artifact && (
                            <div 
                              className="mt-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg cursor-pointer hover:bg-violet-500/20 transition-colors"
                              onClick={() => {
                                setPanelOpen(true)
                                setSelectedChunkId(null)  // Clear chunk selection to show artifact
                                // On mobile, close the drawer when artifact is clicked
                                if (onArtifactClick) {
                                  onArtifactClick()
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-violet-500/20 rounded">
                                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-violet-400 font-mono">
                                    {message.artifact.title}
                                  </div>
                                  <div className="text-xs text-zinc-400 mt-0.5">
                                    {message.artifact.artifact_type === 'checklist' && 'Checklist'}
                                    {message.artifact.artifact_type === 'notebook' && 'Notebook'}
                                    {message.artifact.artifact_type === 'script' && 'Script'}
                                  </div>
                                </div>
                                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                          )}
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
                    {thinkingStep ? (
                      <div className="text-sm text-zinc-400 italic animate-pulse flex items-center gap-2">
                        <span className="animate-spin">💭</span>
                        <span>{thinkingStep}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-4 bg-zinc-800 rounded shimmer w-3/4" />
                        <div className="h-4 bg-zinc-800 rounded shimmer w-1/2" />
                        <div className="h-4 bg-zinc-800 rounded shimmer w-5/6" />
                      </div>
                    )}
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

      {/* Right Panel - Chunk Viewer (Slides in from right) */}
      {panelOpen && (
        <>
          {/* Mobile Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
            onClick={handleClosePanel}
          />
          {/* Panel - Slide in from right animation */}
          <div className="fixed md:relative inset-y-0 right-0 z-50 md:z-auto transform transition-transform duration-300 ease-out translate-x-0">
            <ChunkViewerPanel
              chunkId={selectedChunkId}
              onClose={handleClosePanel}
              chunkData={chunkData}
              loading={chunkLoading}
              artifact={messages.find(m => m.artifact)?.artifact || null}
            />
          </div>
        </>
      )}
    </div>
  )
}