import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
  /** Visually and semantically between checked and unchecked. Does not affect `checked`. */
  indeterminate?: boolean
}

/** Checkbox with a label whose whole row is a click target, and indeterminate support. */
export function Checkbox({
  className,
  label,
  indeterminate = false,
  id,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-text',
        rest.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          'size-[18px] shrink-0 rounded border border-border bg-surface accent-accent',
          'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
          className,
        )}
        {...rest}
      />
      {label}
    </label>
  )
}

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode
}

/** Radio button with the same label click-target behaviour as `Checkbox`. */
export function Radio({ className, label, id, ...rest }: RadioProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-text',
        rest.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        id={id}
        type="radio"
        className={cn(
          'size-[18px] shrink-0 border border-border bg-surface accent-accent',
          'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
          className,
        )}
        {...rest}
      />
      {label}
    </label>
  )
}
