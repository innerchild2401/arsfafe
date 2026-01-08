"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBackendUrl } from '@/lib/api'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      const formData = new FormData()
      formData.append('file', file)
      if (title) formData.append('title', title)
      if (author) formData.append('author', author)

      const backendUrl = getBackendUrl()

      const response = await fetch(`${backendUrl}/api/books/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`)
      }

      setSuccess(true)
      
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 2000)
      
    } catch (error: any) {
      setError(error.message || 'Failed to upload book')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="mb-6 sm:mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm sm:text-base font-medium text-blue-600 hover:text-blue-700 mb-4 sm:mb-6 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">Upload Book</h1>
          <p className="text-sm sm:text-base text-gray-600">Add a PDF or EPUB file to your knowledge center</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 lg:p-8">
          <form onSubmit={handleUpload} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                <p className="text-sm text-green-800">Book uploaded successfully! Processing in background...</p>
              </div>
            )}

            <div>
              <label htmlFor="file" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                Book File <span className="text-red-500">*</span>
              </label>
              <input
                id="file"
                type="file"
                accept=".pdf,.epub,application/pdf,application/epub+zip"
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            <div>
              <label htmlFor="title" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                Title <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                placeholder="Book title"
              />
            </div>

            <div>
              <label htmlFor="author" className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                Author <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                disabled={uploading}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                placeholder="Author name"
              />
            </div>

            <button
              type="submit"
              disabled={uploading || !file || success}
              className="w-full bg-blue-600 text-white px-4 py-2.5 sm:px-6 sm:py-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm sm:text-base transition-colors"
            >
              {uploading ? 'Uploading...' : success ? 'Uploaded!' : 'Upload Book'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
