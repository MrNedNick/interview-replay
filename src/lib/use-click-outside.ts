import { useEffect, useRef } from 'react'
import { attachOutsideListener } from './core/click-outside'

/** Calls `onOutside` on a pointer event outside the returned ref's element. Shared by dropdown, tooltip, drawer. */
export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    return attachOutsideListener(() => ref.current, onOutside)
  }, [onOutside])

  return ref
}
