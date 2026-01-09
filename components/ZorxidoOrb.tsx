"use client"

interface ZorxidoOrbProps {
  isActive?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function ZorxidoOrb({ isActive = false, size = 'md' }: ZorxidoOrbProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  return (
    <div className={`${sizeClasses[size]} relative flex items-center justify-center`}>
      <div
        className={`
          w-full h-full rounded-full
          bg-gradient-to-br from-emerald-400 to-emerald-600
          ${isActive ? 'zorxido-orb-active' : 'zorxido-orb'}
          shadow-lg shadow-emerald-500/50
        `}
      />
      <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-sm" />
    </div>
  )
}