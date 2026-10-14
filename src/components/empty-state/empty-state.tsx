import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  title: string
  /** One line on what to do next — an empty screen without a next step is a dead end. */
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg',
        'border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-text-muted [&>svg]:size-8">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-xs text-text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
