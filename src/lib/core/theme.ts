/**
 * Framework-agnostic light/dark theme handling. An explicit choice is stored;
 * until there is one, the system preference decides. Exactly one of `light`
 * and `dark` sits on <html>, so the tokens' media query and Tailwind's
 * `dark:` variant always agree.
 */
export type Theme = 'light' | 'dark'

export const DEFAULT_THEME_KEY = 'theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function getStoredTheme(key = DEFAULT_THEME_KEY): Theme | null {
  try {
    const value = window.localStorage.getItem(key)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** The theme on the page right now, whatever put it there. */
export function getAppliedTheme(): Theme {
  const classes = document.documentElement.classList
  if (classes.contains('dark')) return 'dark'
  if (classes.contains('light')) return 'light'
  return getSystemTheme()
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  // Native scrollbars and form controls follow along.
  root.style.colorScheme = theme
}

/** Applies an explicit choice and remembers it. */
export function setTheme(theme: Theme, key = DEFAULT_THEME_KEY): void {
  applyTheme(theme)
  try {
    window.localStorage.setItem(key, theme)
  } catch {
    /* storage blocked — the theme still applies, it just won't be remembered */
  }
}

/**
 * Keeps the page in step after load: follows the system while nothing is
 * stored, and picks up a choice made in another tab. Returns the cleanup.
 */
export function watchTheme(key = DEFAULT_THEME_KEY): () => void {
  const mql = window.matchMedia(DARK_QUERY)
  const onSystemChange = () => {
    if (!getStoredTheme(key)) applyTheme(getSystemTheme())
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      applyTheme(getStoredTheme(key) ?? getSystemTheme())
    }
  }
  mql.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  return () => {
    mql.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Source for an inline <head> script that applies the theme before first
 * paint, so a dark page never flashes white. Render it with
 * `dangerouslySetInnerHTML` in an SSR layout, or paste its output into
 * index.html in a Vite app. Same rules as the functions above, without
 * importing them — it runs before any bundle loads.
 */
export function themeScript(key = DEFAULT_THEME_KEY): string {
  return `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(key)})}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('${DARK_QUERY}').matches?'dark':'light';var r=document.documentElement;r.classList.add(t);r.style.colorScheme=t})()`
}
