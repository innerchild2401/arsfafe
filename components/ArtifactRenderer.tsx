"use client"

import { useState } from 'react'
import { Check, Clock, Sparkles, Code, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

interface ArtifactStep {
  id: string
  time?: string
  action: string
  description: string
  checked?: boolean
}

interface ArtifactCell {
  type: 'markdown' | 'code' | 'output'
  language?: string
  content: string
}

interface ArtifactScene {
  id: string
  context: string
  speaker: string
  text: string
  action: string
}

interface ArtifactData {
  artifact_type: 'checklist' | 'notebook' | 'script'
  title: string
  content: {
    steps?: ArtifactStep[]
    cells?: ArtifactCell[]
    scenes?: ArtifactScene[]
  }
  citations?: string[]
  variables?: Record<string, string>
}

interface ArtifactRendererProps {
  artifact: ArtifactData
  onStepToggle?: (stepId: string, checked: boolean) => void
  onStepRefine?: (stepId: string) => void
  onVariableChange?: (variable: string, value: string) => void
}

// Helper function to render markdown with LaTeX support
function renderMarkdownWithLaTeX(content: string) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  // Match block math: $$...$$
  const blockMathRegex = /\$\$([^$]+)\$\$/g
  // Match inline math: $...$ (but not $$)
  const inlineMathRegex = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g

  // Collect all matches
  const matches: Array<{ type: 'block' | 'inline'; content: string; index: number; length: number }> = []
  
  let match: RegExpExecArray | null
  blockMathRegex.lastIndex = 0
  while ((match = blockMathRegex.exec(content)) !== null) {
    matches.push({
      type: 'block',
      content: match[1],
      index: match.index,
      length: match[0].length
    })
  }

  inlineMathRegex.lastIndex = 0
  while ((match = inlineMathRegex.exec(content)) !== null) {
    // Skip if it's part of a block math
    const isInBlock = matches.some(m => 
      m.type === 'block' && 
      match!.index >= m.index && 
      match!.index < m.index + m.length
    )
    if (!isInBlock) {
      matches.push({
        type: 'inline',
        content: match[1],
        index: match.index,
        length: match[0].length
      })
    }
  }

  // Sort matches by index
  matches.sort((a, b) => a.index - b.index)

  // Build parts array
  matches.forEach((mathMatch) => {
    // Add text before math
    if (mathMatch.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="text-zinc-300 whitespace-pre-wrap">
          {content.slice(lastIndex, mathMatch.index)}
        </span>
      )
    }

    // Add math
    try {
      if (mathMatch.type === 'block') {
        parts.push(
          <div key={`math-block-${mathMatch.index}`} className="my-4">
            <BlockMath math={mathMatch.content} />
          </div>
        )
      } else {
        parts.push(
          <InlineMath key={`math-inline-${mathMatch.index}`} math={mathMatch.content} />
        )
      }
    } catch (e) {
      // If LaTeX parsing fails, render as plain text
      parts.push(
        <span key={`math-fallback-${mathMatch.index}`} className="text-zinc-400 font-mono">
          ${mathMatch.content}$
        </span>
      )
    }

    lastIndex = mathMatch.index + mathMatch.length
  })

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="text-zinc-300 whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>
    )
  }

  return parts.length > 0 ? parts : [<span key="text-fallback" className="text-zinc-300 whitespace-pre-wrap">{content}</span>]
}

export default function ArtifactRenderer({ artifact, onStepToggle, onStepRefine, onVariableChange }: ArtifactRendererProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [editingVariable, setEditingVariable] = useState<string | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>(artifact.variables || {})
  const [updatedStepIds, setUpdatedStepIds] = useState<Set<string>>(new Set())  // Track updated steps for green flash
  const [updatedVariableKeys, setUpdatedVariableKeys] = useState<Set<string>>(new Set())  // Track updated variables

  const handleStepClick = (stepId: string) => {
    setSelectedStepId(selectedStepId === stepId ? null : stepId)
  }

  const handleCheckboxChange = (stepId: string, checked: boolean) => {
    if (onStepToggle) {
      onStepToggle(stepId, checked)
    }
  }

  const handleVariableEdit = (key: string) => {
    setEditingVariable(key)
  }

  const handleVariableBlur = (key: string, value: string) => {
    setEditingVariable(null)
    const originalValue = artifact.variables?.[key] || ''
    if (value !== originalValue && onVariableChange) {
      setVariableValues(prev => ({ ...prev, [key]: value }))
      onVariableChange(key, value)
    } else if (value === originalValue) {
      // Reset if unchanged
      setVariableValues(prev => ({ ...prev, [key]: originalValue }))
    }
  }

  const handleVariableKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, key: string) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setEditingVariable(null)
      // Reset to original value
      setVariableValues(prev => ({ ...prev, [key]: artifact.variables?.[key] || '' }))
    }
  }

  // Checklist Artifact (Parenting/Habits)
  if (artifact.artifact_type === 'checklist' && artifact.content.steps) {
    return (
      <div className="h-full bg-zinc-900 border-l-4 border-violet-500 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-zinc-50 font-mono">{artifact.title}</h2>
              {artifact.variables && Object.keys(artifact.variables).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(variableValues).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-400 font-mono">{key}:</span>
                      {editingVariable === key ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setVariableValues(prev => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => handleVariableBlur(key, e.target.value)}
                          onKeyDown={(e) => handleVariableKeyDown(e, key)}
                          className="text-xs text-zinc-200 font-mono bg-zinc-800 border border-violet-500/50 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-500 min-w-[80px]"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => handleVariableEdit(key)}
                          className="text-xs text-zinc-300 font-mono bg-zinc-800/50 border border-zinc-700 rounded px-1.5 py-0.5 hover:border-violet-500/50 hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          {value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Steps List */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="space-y-3">
            {artifact.content.steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "bg-zinc-950 border border-zinc-800 rounded-lg p-4 transition-all",
                  selectedStepId === step.id && "ring-2 ring-violet-500/50",
                  step.checked && "opacity-60"
                )}
                onClick={() => handleStepClick(step.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCheckboxChange(step.id, !step.checked)
                    }}
                    className={cn(
                      "mt-0.5 flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors",
                      step.checked
                        ? "bg-violet-500 border-violet-500"
                        : "border-zinc-600 hover:border-violet-500"
                    )}
                  >
                    {step.checked && <Check className="w-4 h-4 text-zinc-950" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      {step.time && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{step.time}</span>
                        </div>
                      )}
                      <h3 className={cn(
                        "text-sm font-semibold text-zinc-50 font-mono",
                        step.checked && "line-through text-zinc-500"
                      )}>
                        {step.action}
                      </h3>
                    </div>
                    <p className={cn(
                      "text-sm text-zinc-300 mt-1",
                      step.checked && "line-through text-zinc-500"
                    )}>
                      {step.description}
                    </p>
                  </div>

                  {/* Refine Button (on hover/selection) */}
                  {selectedStepId === step.id && onStepRefine && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onStepRefine(step.id)
                      }}
                      className="flex-shrink-0 p-2 text-violet-400 hover:bg-violet-500/20 rounded-lg transition-colors"
                      title="Refine this step"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Citations Footer */}
        {artifact.citations && artifact.citations.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-zinc-400">Sources:</span>
              {artifact.citations.map((citation) => (
                <span
                  key={citation}
                  className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-1 rounded border border-violet-500/30"
                >
                  {citation}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Notebook Artifact (Physics/Math)
  if (artifact.artifact_type === 'notebook' && artifact.content.cells) {
    return (
      <div className="h-full bg-zinc-900 border-l-4 border-violet-500 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Code className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-zinc-50 font-mono">{artifact.title}</h2>
              {artifact.variables && Object.keys(artifact.variables).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(variableValues).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-400 font-mono">{key}:</span>
                      {editingVariable === key ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setVariableValues(prev => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => handleVariableBlur(key, e.target.value)}
                          onKeyDown={(e) => handleVariableKeyDown(e, key)}
                          className="text-xs text-zinc-200 font-mono bg-zinc-800 border border-violet-500/50 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-500 min-w-[80px]"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => handleVariableEdit(key)}
                          className="text-xs text-zinc-300 font-mono bg-zinc-800/50 border border-zinc-700 rounded px-1.5 py-0.5 hover:border-violet-500/50 hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          {value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cells */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="space-y-4 max-w-4xl">
            {artifact.content.cells.map((cell, index) => (
              <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                {cell.type === 'markdown' && (
                  <div className="p-4 prose prose-invert prose-sm max-w-none">
                    <div className="text-zinc-300">
                      {renderMarkdownWithLaTeX(cell.content)}
                    </div>
                  </div>
                )}
                {cell.type === 'code' && (
                  <div>
                    <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center gap-2">
                      <Code className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs text-zinc-400 font-mono">{cell.language || 'code'}</span>
                    </div>
                    <pre className="p-4 text-sm font-mono text-emerald-400 overflow-x-auto">
                      <code>{cell.content}</code>
                    </pre>
                  </div>
                )}
                {cell.type === 'output' && (
                  <div className="p-4 bg-zinc-900 border-t border-zinc-800">
                    <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">{cell.content}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Citations Footer */}
        {artifact.citations && artifact.citations.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-zinc-400">Sources:</span>
              {artifact.citations.map((citation) => (
                <span
                  key={citation}
                  className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-1 rounded border border-violet-500/30"
                >
                  {citation}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Script Artifact
  if (artifact.artifact_type === 'script' && artifact.content.scenes) {
    return (
      <div className="h-full bg-zinc-900 border-l-4 border-violet-500 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-zinc-50 font-mono">{artifact.title}</h2>
              {artifact.variables && Object.keys(artifact.variables).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(variableValues).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-400 font-mono">{key}:</span>
                      {editingVariable === key ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setVariableValues(prev => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => handleVariableBlur(key, e.target.value)}
                          onKeyDown={(e) => handleVariableKeyDown(e, key)}
                          className="text-xs text-zinc-200 font-mono bg-zinc-800 border border-violet-500/50 rounded px-1.5 py-0.5 focus:outline-none focus:border-violet-500 min-w-[80px]"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => handleVariableEdit(key)}
                          className="text-xs text-zinc-300 font-mono bg-zinc-800/50 border border-zinc-700 rounded px-1.5 py-0.5 hover:border-violet-500/50 hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          {value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scenes */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="space-y-4">
            {artifact.content.scenes.map((scene) => (
              <div key={scene.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                {/* Context */}
                <div className="text-xs text-zinc-400 font-mono">{scene.context}</div>
                
                {/* Script Cards: Distinct boxes for "What to Say" vs "What to Do" */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* "What to Say" Card */}
                  <div className="bg-zinc-900 border border-violet-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1 bg-violet-500/20 rounded">
                        <FileText className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <span className="text-xs font-semibold text-violet-400 font-mono">What to Say</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-400 font-mono">{scene.speaker}:</div>
                      <p className="text-sm text-zinc-200 leading-relaxed">{scene.text}</p>
                    </div>
                  </div>
                  
                  {/* "What to Do" Card */}
                  {scene.action && (
                    <div className="bg-zinc-900 border border-emerald-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 bg-emerald-500/20 rounded">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="text-xs font-semibold text-emerald-400 font-mono">What to Do</span>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed">{scene.action}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Citations Footer */}
        {artifact.citations && artifact.citations.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-zinc-400">Sources:</span>
              {artifact.citations.map((citation) => (
                <span
                  key={citation}
                  className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-1 rounded border border-violet-500/30"
                >
                  {citation}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Fallback
  return (
    <div className="h-full bg-zinc-900 border-l-4 border-violet-500 flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-zinc-400">Unknown artifact type: {artifact.artifact_type}</p>
      </div>
    </div>
  )
}
