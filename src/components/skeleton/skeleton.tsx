import { cn } from '../../lib/cn'

export interface SkeletonProps {
  className?: string
  /** Number of stacked lines — handy for list and card placeholders. */
  lines?: number
}

export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-4 w-full animate-pulse rounded-sm bg-surface-raised',
            i === lines - 1 && lines > 1 && 'w-2/3',
            className,
          )}
        />
      ))}
    </div>
  )
}
