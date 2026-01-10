"use client"

import { useState } from 'react'

interface CitationTooltipProps {
  persistentId: string  // e.g., "#chk_a1b2c3d4"
  chunkText: string  // Truncated chunk text for hover preview
  source?: string  // Book, chapter, section info
  chunkId?: string  // UUID of the chunk (for fetching full data)
  onCitationClick?: (chunkId: string) => void
}

export default function CitationTooltip({ 
  persistentId, 
  chunkText, 
  source,
  chunkId,
  onCitationClick 
}: CitationTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onCitationClick && chunkId) {
      onCitationClick(chunkId)
    }
  }

  // Truncate text for hover preview (max 200 chars)
  const truncatedText = chunkText.length > 200 
    ? chunkText.substring(0, 200) + '...' 
    : chunkText

  return (
    <span className="relative inline-block">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-mono border border-emerald-500/30 text-emerald-400 rounded transition-colors ${
          chunkId 
            ? 'cursor-pointer hover:bg-emerald-500/20 hover:border-emerald-500/50' 
            : 'cursor-default opacity-60'
        }`}
        style={{
          background: 'transparent',
          boxShadow: '0 0 8px rgba(16, 185, 129, 0.2)'
        }}
      >
        {persistentId}
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-w-sm z-50 pointer-events-none">
          <div className="bg-zinc-900/98 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl p-4">
            <div className="text-xs font-mono text-emerald-400 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {persistentId}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed line-clamp-5 font-serif">
              {truncatedText}
            </p>
            {source && (
              <div className="mt-2 text-xs text-zinc-400 font-mono border-t border-zinc-800 pt-2">
                {source}
              </div>
            )}
            {chunkId && (
              <div className="mt-2 text-xs text-emerald-400 font-mono">
                Click to view full context →
              </div>
            )}
            {/* Arrow */}
            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700/50" />
          </div>
        </div>
      )}
    </span>
  )
}