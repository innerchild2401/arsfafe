"use client"

interface TerminalLog {
  timestamp: Date
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
}

interface TerminalDrawerProps {
  isOpen: boolean
  logs: TerminalLog[]
  onClose?: () => void
}

export default function TerminalDrawer({ isOpen, logs, onClose }: TerminalDrawerProps) {
  if (!isOpen) return null

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-emerald-400'
      case 'error':
        return 'text-rose-400'
      case 'warning':
        return 'text-amber-400'
      default:
        return 'text-zinc-400'
    }
  }

  const getLogPrefix = (level: string) => {
    switch (level) {
      case 'success':
        return '✓'
      case 'error':
        return '✗'
      case 'warning':
        return '⚠'
      default:
        return '→'
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="bg-zinc-900 border-t border-zinc-800 shadow-2xl max-h-[40vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">Terminal</span>
            <span className="text-xs font-mono text-zinc-600">({Math.min(logs.length, 4)} lines)</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Logs - Show only last 4 lines */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-zinc-500">Waiting for logs...</div>
            ) : (
              logs.slice(-4).map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-zinc-600 flex-shrink-0 w-16">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`flex-shrink-0 w-4 ${getLogColor(log.level)}`}>
                    {getLogPrefix(log.level)}
                  </span>
                  <span className={`flex-1 ${getLogColor(log.level)} truncate`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}