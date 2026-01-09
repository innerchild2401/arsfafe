"use client"

interface SparklineChartProps {
  data: number[]
  color?: 'emerald' | 'amber' | 'rose' | 'violet'
  height?: number
}

export default function SparklineChart({ data, color = 'emerald', height = 20 }: SparklineChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-zinc-500 font-mono">No data</div>
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  const colorClasses = {
    emerald: 'stroke-emerald-400',
    amber: 'stroke-amber-400',
    rose: 'stroke-rose-400',
    violet: 'stroke-violet-400'
  }

  return (
    <div className="flex items-center gap-2">
      <svg width="60" height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          strokeWidth="1.5"
          className={colorClasses[color]}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="text-xs font-mono text-zinc-400">{data[data.length - 1]}</span>
    </div>
  )
}