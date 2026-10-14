/**
 * Framework-agnostic outside-pointer detection, shared by the React hook and
 * the Vue composable. `getElement` is a thunk rather than a plain reference
 * because both frameworks resolve their ref lazily on each event.
 */
export function attachOutsideListener(
  getElement: () => HTMLElement | null,
  onOutside: () => void,
): () => void {
  function handlePointerDown(event: PointerEvent) {
    const el = getElement()
    if (!el || el.contains(event.target as Node)) return
    onOutside()
  }

  document.addEventListener('pointerdown', handlePointerDown)
  return () => document.removeEventListener('pointerdown', handlePointerDown)
}
