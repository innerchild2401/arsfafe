"use client"

import { cn } from '@/lib/utils'

interface ViewSwitcherProps {
  view: 'inspector' | 'composer'
  onViewChange: (view: 'inspector' | 'composer') => void
  className?: string
}

export default function ViewSwitcher({ view, onViewChange, className }: ViewSwitcherProps) {
  return (
    <div className={cn("flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1", className)}>
      <button
        onClick={() => onViewChange('inspector')}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-md transition-colors",
          view === 'inspector'
            ? "bg-zinc-800 text-zinc-50"
            : "text-zinc-400 hover:text-zinc-200"
        )}
      >
        Inspector
      </button>
      <button
        onClick={() => onViewChange('composer')}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-md transition-colors",
          view === 'composer'
            ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
            : "text-zinc-400 hover:text-zinc-200"
        )}
      >
        Composer
      </button>
    </div>
  )
}
