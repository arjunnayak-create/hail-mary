import { useEffect, useState } from 'react'

/**
 * Track the visual viewport so fixed UI can sit above the on-screen keyboard (iOS Safari
 * shrinks the visual viewport, not the layout viewport). Writes --vv-h / --vv-top CSS vars
 * on <html> and reports whether the keyboard is probably open.
 */
export function useVisualViewport(): { keyboardOpen: boolean } {
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    const update = () => {
      const h = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0
      root.style.setProperty('--vv-h', `${h}px`)
      root.style.setProperty('--vv-top', `${top}px`)
      setKeyboardOpen(window.innerHeight - h > 120)
      // iOS scrolls the layout viewport when focusing an input; keep the page pinned
      if (window.scrollY !== 0 && !vv) window.scrollTo(0, 0)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return { keyboardOpen }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
