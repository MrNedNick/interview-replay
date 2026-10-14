import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button, type ButtonVariant } from '../button/button'
import { Modal } from '../modal/modal'

export interface ConfirmOptions {
  title?: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Button variant for the confirm action — 'danger' for destructive actions. */
  variant?: Extract<ButtonVariant, 'primary' | 'danger'>
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

/**
 * `await confirm(...)` in place of a Confirm/Cancel state machine in every
 * screen that needs one. Resolves `true` on confirm, `false` on cancel,
 * Escape or backdrop click — the dialog only ever has one at a time.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const settleRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      settleRef.current = resolve
      setPending({ ...options, resolve })
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    settleRef.current?.(value)
    settleRef.current = null
    setPending(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={pending !== null}
        onClose={() => settle(false)}
        title={pending?.title ?? 'Are you sure?'}
        size="sm"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={pending?.variant ?? 'primary'}
              size="sm"
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {pending?.description}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmDialogProvider>')
  return ctx
}
