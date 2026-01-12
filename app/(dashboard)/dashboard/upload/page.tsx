"use client"

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getBackendUrl } from '@/lib/api'
import TerminalDrawer from '@/components/TerminalDrawer'

interface TerminalLog {
  timestamp: Date
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
}

interface BackendLog {
  id: string
  log_message: string
  log_level: 'info' | 'success' | 'error' | 'warning'
  created_at: string
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const [bookId, setBookId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const addLog = (level: TerminalLog['level'], message: string) => {
    setTerminalLogs(prev => {
      const newLogs = [...prev, { timestamp: new Date(), level, message }]
      // Keep only last 4 lines
      return newLogs.slice(-4)
    })
    setShowTerminal(true)
  }

  // Poll for logs when book is processing
  useEffect(() => {
    if (bookId && isProcessing) {
      const pollLogs = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return

          const backendUrl = getBackendUrl()
          const response = await fetch(`${backendUrl}/api/books/${bookId}/logs?limit=10`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })

          if (response.ok) {
            const data = await response.json()
            const logs: BackendLog[] = data.logs || []
            
            // Convert backend logs to terminal logs and keep only last 4
            const convertedLogs: TerminalLog[] = logs.slice(-4).map(log => ({
              timestamp: new Date(log.created_at),
              level: log.log_level,
              message: log.log_message
            }))

            if (convertedLogs.length > 0) {
              setTerminalLogs(convertedLogs)
            }

            // Check if processing is complete (status: ready or error)
            const statusResponse = await fetch(`${backendUrl}/api/books/${bookId}`, {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            })

            if (statusResponse.ok) {
              const statusData = await statusResponse.json()
              const bookStatus = statusData.book?.status

              if (bookStatus === 'ready') {
                setIsProcessing(false)
                addLog('success', 'Processing completed successfully!')
              } else if (bookStatus === 'error') {
                setIsProcessing(false)
                addLog('error', 'Processing failed. Check book details for error message.')
              }
            }
          }
        } catch (error) {
          console.error('Error polling logs:', error)
        }
      }

      // Poll immediately, then every 2 seconds
      pollLogs()
      pollingIntervalRef.current = setInterval(pollLogs, 2000)
    } else {
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [bookId, isProcessing, supabase])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      
      const validTypes = ['application/pdf', 'application/epub+zip', 'application/epub']
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a PDF or EPUB file')
        return
      }
      
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size must be less than 100MB')
        return
      }
      
      setFile(selectedFile)
      setError(null)
      
      if (!title) {
        const filename = selectedFile.name.replace(/\.[^/.]+$/, '')
        setTitle(filename)
      }
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(false)
    setTerminalLogs([])
    setShowTerminal(true)

    addLog('info', `Starting upload: ${file.name}`)
    addLog('info', `File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      addLog('info', 'Authenticated. Preparing upload...')

      const formData = new FormData()
      formData.append('file', file)
      if (title) formData.append('title', title)
      if (author) formData.append('author', author)

      const backendUrl = getBackendUrl()

      addLog('info', 'Uploading to server...')

      // Don't set Content-Type header - let browser set it with boundary for FormData
      const response = await fetch(`${backendUrl}/api/books/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
          // Explicitly NOT setting Content-Type - browser will set it with boundary
        },
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`)
      }

      const uploadData = await response.json()
      const uploadedBookId = uploadData.book_id

      if (uploadedBookId) {
        setBookId(uploadedBookId)
        setIsProcessing(true)
      }

      addLog('success', 'Upload successful!')
      addLog('info', 'Processing started...')

      setSuccess(true)
      
    } catch (error: any) {
      addLog('error', `Upload failed: ${error.message}`)
      setError(error.message || 'Failed to upload book')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-zinc-50 mb-2">Import</h1>
            <p className="text-sm text-zinc-400">Add a PDF or EPUB file to your knowledge center</p>
          </div>

          <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 space-y-6">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <p className="text-sm text-emerald-400">Book uploaded successfully! Processing in background...</p>
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <label htmlFor="file" className="block text-sm font-medium text-zinc-300 mb-2">
                  Book File <span className="text-rose-400">*</span>
                </label>
                <input
                  id="file"
                  type="file"
                  accept=".pdf,.epub,application/pdf,application/epub+zip"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {file && (
                  <p className="mt-2 text-sm font-mono text-zinc-500">
                    {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-2">
                  Title <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                  className="underlined-input w-full text-zinc-50"
                  placeholder="Book title"
                />
              </div>

              <div>
                <label htmlFor="author" className="block text-sm font-medium text-zinc-300 mb-2">
                  Author <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <input
                  id="author"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={uploading}
                  className="underlined-input w-full text-zinc-50"
                  placeholder="Author name"
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setShowTerminal(!showTerminal)}
                  className="text-xs font-mono text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  {showTerminal ? 'Hide' : 'Show'} Terminal
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file || success}
                  className="px-6 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
                >
                  {uploading ? 'Uploading...' : success ? 'Uploaded!' : 'Import Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Terminal Drawer */}
      <TerminalDrawer
        isOpen={showTerminal}
        logs={terminalLogs}
        onClose={() => setShowTerminal(false)}
      />
    </div>
  )
}