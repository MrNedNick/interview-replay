import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

/** Bare text input. Pair it with `Field` for label, hint and error text. */
export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text',
        'placeholder:text-text-muted transition-colors duration-150',
        'hover:border-accent/50 focus:border-accent',
        'aria-[invalid=true]:border-danger',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
