"use client"

import { useState } from 'react'
import ViewSwitcher from './ViewSwitcher'
import ArtifactRenderer from './ArtifactRenderer'
import { createClient } from '@/lib/supabase/client'
import { getBackendUrl } from '@/lib/api'

// Using inline SVG instead of lucide-react for consistency

interface ChunkViewerPanelProps {
  chunkId: string | null
  onClose: () => void
  chunkData: {
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
  } | null
  loading?: boolean
  artifact?: {
    artifact_type: 'checklist' | 'notebook' | 'script'
    title: string
    content: any
    citations?: string[]
    variables?: Record<string, string>
  } | null
  messageId?: string | null  // ID of the message containing this artifact (for refinement)
  onArtifactUpdate?: (updatedArtifact: ChunkViewerPanelProps['artifact']) => void  // Callback to update artifact in parent
}

export default function ChunkViewerPanel({ chunkId, onClose, chunkData, loading, artifact, messageId, onArtifactUpdate }: ChunkViewerPanelProps) {
  const [view, setView] = useState<'inspector' | 'composer'>(
    artifact ? 'composer' : 'inspector'
  )
  const [refining, setRefining] = useState(false)
  const supabase = createClient()

  // Handle variable change - call refinement endpoint
  const handleVariableChange = async (variable: string, value: string) => {
    if (!messageId || !artifact) {
      console.warn('Cannot refine artifact: missing messageId or artifact')
      return
    }

    setRefining(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/api/chat/refine-artifact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message_id: messageId,
          refinement_type: 'variable',
          variable_key: variable,
          variable_value: value
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Refinement failed' }))
        throw new Error(errorData.detail || `Refinement failed: ${response.statusText}`)
      }

      const data = await response.json()
      const updatedArtifact = data.artifact

      // Update artifact in parent component
      if (onArtifactUpdate) {
        onArtifactUpdate(updatedArtifact)
      }
    } catch (error: any) {
      console.error('Error refining artifact:', error)
      alert(`Failed to refine artifact: ${error.message || 'Unknown error'}`)
    } finally {
      setRefining(false)
    }
  }

  // Handle step refinement
  const handleStepRefine = async (stepId: string) => {
    if (!messageId || !artifact) {
      console.warn('Cannot refine step: missing messageId or artifact')
      return
    }

    // For MVP, prompt user for refinement instruction
    const refinementInstruction = prompt(`Refine step "${stepId}":`, '')
    if (!refinementInstruction || !refinementInstruction.trim()) {
      return
    }

    setRefining(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const backendUrl = getBackendUrl()
      const response = await fetch(`${backendUrl}/api/chat/refine-artifact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message_id: messageId,
          refinement_type: 'step',
          step_id: stepId,
          refinement_instruction: refinementInstruction
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Refinement failed' }))
        throw new Error(errorData.detail || `Refinement failed: ${response.statusText}`)
      }

      const data = await response.json()
      const updatedArtifact = data.artifact

      // Update artifact in parent component
      if (onArtifactUpdate) {
        onArtifactUpdate(updatedArtifact)
      }
    } catch (error: any) {
      console.error('Error refining step:', error)
      alert(`Failed to refine step: ${error.message || 'Unknown error'}`)
    } finally {
      setRefining(false)
    }
  }

  // If we have an artifact but no chunk, default to composer view
  if (artifact && !chunkId && !chunkData) {
    return (
      <div className="h-full w-full md:w-96 lg:w-[32rem] bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <ArtifactRenderer 
          artifact={artifact}
          onVariableChange={handleVariableChange}
          onStepRefine={handleStepRefine}
        />
      </div>
    )
  }

  if (!chunkId && !chunkData && !artifact) return null

  return (
    <div className="h-full w-full md:w-96 lg:w-[32rem] bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-sm font-semibold text-zinc-50 font-mono">Workbench</h2>
          {artifact && (
            <ViewSwitcher view={view} onViewChange={setView} />
          )}
          {refining && (
            <div className="text-xs text-violet-400 animate-pulse">
              Refining...
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content - Polymorphic Canvas */}
      <div className="flex-1 overflow-hidden">
        {view === 'composer' && artifact ? (
          <ArtifactRenderer 
            artifact={artifact}
            onVariableChange={handleVariableChange}
            onStepRefine={handleStepRefine}
          />
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            {loading ? (
              <div className="space-y-4">
                <div className="h-6 bg-zinc-800 rounded shimmer w-3/4" />
                <div className="h-4 bg-zinc-800 rounded shimmer w-full" />
                <div className="h-4 bg-zinc-800 rounded shimmer w-5/6" />
                <div className="h-4 bg-zinc-800 rounded shimmer w-4/5" />
              </div>
            ) : chunkData ? (
              <div className="space-y-6">
                {/* Book Info */}
                {chunkData.book && (
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 font-mono mb-1">
                      {chunkData.book.title}
                    </h3>
                    {chunkData.book.author && (
                      <p className="text-xs text-zinc-500 font-mono">
                        {chunkData.book.author}
                      </p>
                    )}
                  </div>
                )}

                {/* Parent Context */}
                {chunkData.parent_context && (
                  <div className="space-y-2">
                    {chunkData.parent_context.chapter_title && (
                      <h4 className="text-sm font-semibold text-zinc-300 font-mono">
                        {chunkData.parent_context.chapter_title}
                        {chunkData.parent_context.section_title && (
                          <span className="text-zinc-500"> / {chunkData.parent_context.section_title}</span>
                        )}
                      </h4>
                    )}
                  </div>
                )}

                {/* Chunk Text */}
                <div className="prose prose-invert prose-sm max-w-none">
                  <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {chunkData.text}
                  </p>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono border-t border-zinc-800 pt-4">
                  {chunkData.page_number && (
                    <span>Page {chunkData.page_number}</span>
                  )}
                  {chunkData.paragraph_index !== null && (
                    <span>Paragraph {chunkData.paragraph_index}</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
            