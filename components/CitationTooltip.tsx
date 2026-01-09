"use client"

import { useState } from 'react'

interface CitationTooltipProps {
  refNumber: number
  text: string
  source?: string
  chunkId?: string
  pageNumber?: number
  onCitationClick?: (chunkId?: string, pageNumber?: number) => void
}

export default function CitationTooltip({ 
  refNumber, 
  text, 
  source,
  chunkId,
  pageNumber,
  onCitationClick 
}: CitationTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleClick = () => {
    if (onCitationClick && (chunkId || pageNumber)) {
      onCitationClick(chunkId, pageNumber)
    }
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-mono border border-violet-500/30 text-violet-400 rounded transition-colors ${
          chunkId || pageNumber 
            ? 'cursor-pointer hover:bg-violet-500/20 hover:border-violet-500/50' 
            : 'cursor-default'
        }`}
        style={{
          background: 'transparent',
          boxShadow: '0 0 5px rgba(139, 92, 246, 0.3)'
        }}
      >
        [Ref: {refNumber}]
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-w-sm z-50">
          <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-lg shadow-xl p-4">
            <div className="text-xs font-mono text-violet-400 mb-2">
              Reference {refNumber}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed line-clamp-4">
              {text}
            </p>
            {source && (
              <div className="mt-2 text-xs text-zinc-400 font-mono">
                {source}
              </div>
            )}
            {(chunkId || pageNumber) && (
              <div className="mt-2 text-xs text-emerald-400 font-mono">
                Click to view source
              </div>
            )}
            {/* Arrow */}
            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
          </div>
        </div>
      )}
    </span>
  )
}