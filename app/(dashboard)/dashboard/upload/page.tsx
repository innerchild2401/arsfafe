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
  const [uploadProgress, setUploadProgress] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      
      // Validate file type
      const validTypes = ['application/pdf', 'application/epub+zip', 'application/epub']
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a PDF or EPUB file')
        return
      }
      
      // Validate file size (max 100MB)
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size must be less than 100MB')
        return
      }
      
      setFile(selectedFile)
      setError(null)
      
      // Auto-fill title from filename if title is empty
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
    setUploadProgress(0)

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Create form data
      const formData = new FormData()
      formData.append('file', file)
      if (title) formData.append('title', title)
      if (author) formData.append('author', author)

      // Get backend URL
      const backendUrl = getBackendUrl()

      // Upload file
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

      const result = await response.json()
      
      setSuccess(true)
      setUploadProgress(100)
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 2000)
      
    } catch (error: any) {
      setError(error.message || 'Failed to upload book')
      setUploadProgress(0)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-6 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Upload Book
          </h1>
          <p className="text-lg text-gray-600">
            Add a PDF or EPUB file to your knowledge center
          </p>
        </div>

        {/* Upload Form */}
        <div className="rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
          <form onSubmit={handleUpload} className="space-y-6">
            {error && (
              <div className="rounded-xl bg-red-50 border-2 border-red-200 p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="rounded-xl bg-green-50 border-2 border-green-200 p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-green-800 mb-1">Upload successful!</p>
                  <p className="text-sm text-green-700">Processing in background. Redirecting to dashboard...</p>
                </div>
              </div>
            )}

            {/* File Upload Dropzone */}
            <div>
              <label htmlFor="file" className="block text-sm font-semibold text-gray-700 mb-3">
                Book File
              </label>
              <div className="relative">
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept=".pdf,.epub,application/pdf,application/epub+zip"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
                <label
                  htmlFor="file"
                  className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                    file
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50'
                  } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {file ? (
                    <>
                      <svg className="w-12 h-12 text-indigo-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-semibold text-indigo-900 mb-1">{file.name}</p>
                      <p className="text-xs text-indigo-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      <p className="text-xs text-gray-500 mt-2">Click to change file</p>
                    </>
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm font-semibold text-gray-700 mb-1">Click to upload or drag and drop</p>
                      <p className="text-xs text-gray-500">PDF or EPUB (MAX. 100MB)</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                Title <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Book title (auto-filled from filename)"
              />
            </div>

            {/* Author */}
            <div>
              <label htmlFor="author" className="block text-sm font-semibold text-gray-700 mb-2">
                Author <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="author"
                name="author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                disabled={uploading}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Author name"
              />
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium text-gray-700">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 h-3 rounded-full transition-all duration-300 shadow-lg"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={uploading || !file || success}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white font-bold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : success ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Uploaded!
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Book
                  </>
                )}
              </button>
            </div>

            {/* Info */}
            <div className="rounded-xl bg-blue-50 border-2 border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-1">Processing Information</p>
                  <p className="text-sm text-blue-800">
                    Large books may take a few minutes to process. You&apos;ll be notified when your book is ready to use in the knowledge center.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
