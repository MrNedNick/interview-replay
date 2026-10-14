import { useEffect, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { DEFAULT_THEME_KEY, getAppliedTheme, setTheme, watchTheme } from '../../lib/core/theme'

export interface ThemeToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> {
  /** localStorage key for the choice. Must match the one in `themeScript()`. */
  storageKey?: string
  labels?: { toDark: string; toLight: string }
}

const DEFAULT_LABELS = { toDark: 'Switch to dark theme', toLight: 'Switch to light theme' }

/**
 * Light/dark switch with no state of its own. `themeScript()` puts the class
 * on <html> before first paint, so which icon and label show is decided by
 * CSS: nothing to hydrate, no flash of the wrong icon. The hidden label goes
 * out of the accessibility tree together with its icon.
 */
export function ThemeToggle({
  storageKey = DEFAULT_THEME_KEY,
  labels = DEFAULT_LABELS,
  className,
  type = 'button',
  ...rest
}: ThemeToggleProps) {
  useEffect(() => watchTheme(storageKey), [storageKey])

  return (
    <button
      type={type}
      onClick={() => setTheme(getAppliedTheme() === 'dark' ? 'light' : 'dark', storageKey)}
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface',
        'text-text-muted transition-colors duration-150 hover:bg-surface-raised hover:text-text',
        'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
        className,
      )}
      {...rest}
    >
      <span className="dark:hidden">
        <MoonIcon />
        <span className="sr-only">{labels.toDark}</span>
      </span>
      <span className="hidden dark:block">
        <SunIcon />
        <span className="sr-only">{labels.toLight}</span>
      </span>
    </button>
  )
}

const ICON_PROPS = {
  'aria-hidden': true,
  className: 'block',
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
