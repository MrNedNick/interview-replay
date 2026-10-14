import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/cn'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  toasts: Toast[]
  show: (kind: ToastKind, message: string, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** At most this many toasts are visible; the oldest is dropped. */
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string, duration = 3500) => {
      const id = ++nextId.current
      setToasts((list) => [...list, { id, kind, message }].slice(-MAX_VISIBLE))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toasts,
      show,
      dismiss,
      success: (m, d) => show('success', m, d),
      error: (m, d) => show('error', m, d),
      info: (m, d) => show('info', m, d),
      warning: (m, d) => show('warning', m, d),
    }),
    [toasts, show, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  info: 'border-l-accent',
  warning: 'border-l-warning',
}

function ToastViewport() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md',
            'border border-border border-l-4 bg-surface px-4 py-3 shadow-card',
            KIND_STYLES[toast.kind],
          )}
        >
          <p className="flex-1 text-sm text-text">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
            className="text-text-muted transition-colors hover:text-text"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
