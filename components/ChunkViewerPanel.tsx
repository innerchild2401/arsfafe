"use client"

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
}

export default function ChunkViewerPanel({ chunkId, onClose, chunkData, loading }: ChunkViewerPanelProps) {
  if (!chunkId && !chunkData) return null

  return (
    <div className="h-full w-full md:w-96 lg:w-[32rem] bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
        <h2 className="text-sm font-semibold text-zinc-50 font-mono">Chunk Viewer</h2>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
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
            {/* Book & Chapter Info */}
            {chunkData.book && (
              <div className="pb-4 border-b border-zinc-800">
                <div className="text-xs font-mono text-zinc-400 mb-2">Source</div>
                <div className="text-sm font-semibold text-zinc-50">{chunkData.book.title}</div>
                {chunkData.book.author && (
                  <div className="text-xs text-zinc-400 mt-1">by {chunkData.book.author}</div>
                )}
              </div>
            )}

            {/* Parent Context (Chapter/Section) */}
            {chunkData.parent_context && (
              <div className="space-y-3">
                {(chunkData.parent_context.chapter_title || chunkData.parent_context.section_title) && (
                  <div>
                    <div className="text-xs font-mono text-zinc-400 mb-2">Location</div>
                    {chunkData.parent_context.chapter_title && (
                      <div className="text-sm font-semibold text-zinc-50">
                        {chunkData.parent_context.chapter_title}
                      </div>
                    )}
                    {chunkData.parent_context.section_title && 
                     chunkData.parent_context.section_title !== chunkData.parent_context.chapter_title && (
                      <div className="text-xs text-zinc-300 mt-1">
                        {chunkData.parent_context.section_title}
                      </div>
                    )}
                  </div>
                )}

                {/* Topic Labels */}
                {chunkData.parent_context.topic_labels && chunkData.parent_context.topic_labels.length > 0 && (
                  <div>
                    <div className="text-xs font-mono text-zinc-400 mb-2">Topics</div>
                    <div className="flex flex-wrap gap-1.5">
                      {chunkData.parent_context.topic_labels.map((label, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs font-mono border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 rounded"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Concise Summary */}
                {chunkData.parent_context.concise_summary && (
                  <div>
                    <div className="text-xs font-mono text-zinc-400 mb-2">Summary</div>
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      {chunkData.parent_context.concise_summary}
                    </div>
                  </div>
                )}

                {/* Full Parent Text */}
                {chunkData.parent_context.full_text && (
                  <div>
                    <div className="text-xs font-mono text-zinc-400 mb-2">Full Context</div>
                    <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-serif p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                      {chunkData.parent_context.full_text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Child Chunk (Specific Paragraph) */}
            <div className="pt-4 border-t border-zinc-800">
              <div className="text-xs font-mono text-zinc-400 mb-2">Exact Paragraph</div>
              <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap p-3 bg-zinc-950/50 rounded-lg border border-emerald-500/20">
                {chunkData.text}
              </div>
              
              {/* Metadata */}
              <div className="flex gap-4 mt-3 text-xs text-zinc-400 font-mono">
                {chunkData.paragraph_index !== null && (
                  <span>Para: {chunkData.paragraph_index}</span>
                )}
                {chunkData.page_number !== null && (
                  <span>Page: {chunkData.page_number}</span>
                )}
                <span>ID: {chunkData.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-sm text-zinc-400">Chunk not found</div>
          </div>
        )}
      </div>
    </div>
  )
}
