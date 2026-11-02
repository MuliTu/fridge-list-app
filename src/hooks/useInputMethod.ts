import { useEffect } from 'react'

/** Keep keyboard interactions instant, including overlays rendered in portals. */
export function useInputMethod() {
  useEffect(() => {
    const root = document.documentElement
    const onPointer = () => {
      root.dataset.inputMethod = 'pointer'
    }
    const onKey = () => {
      root.dataset.inputMethod = 'keyboard'
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
      delete root.dataset.inputMethod
    }
  }, [])
}
