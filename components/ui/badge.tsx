import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        emerald: "border-emerald-500/50 text-emerald-400 bg-transparent shadow-[0_0_5px_rgba(16,185,129,0.3)]",
        amber: "border-amber-500/50 text-amber-400 bg-transparent shadow-[0_0_5px_rgba(245,158,11,0.3)]",
        rose: "border-rose-500/50 text-rose-400 bg-transparent shadow-[0_0_5px_rgba(244,63,94,0.3)]",
        violet: "border-violet-500/50 text-violet-400 bg-transparent shadow-[0_0_5px_rgba(139,92,246,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }