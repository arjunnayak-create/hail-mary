import { useEffect, useRef, useState } from 'react'

/**
 * Wall-clock countdown. `startedAt` (performance.now() ms) or null when stopped.
 * Re-renders ~10x/second; calls onExpire once.
 */
export function useCountdown(startedAt: number | null, durationMs: number, onExpire: () => void): number {
  const [remaining, setRemaining] = useState(durationMs)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    if (startedAt === null) {
      setRemaining(durationMs)
      return
    }
    let raf = 0
    let last = -1
    let fired = false
    const tick = () => {
      const left = Math.max(0, durationMs - (performance.now() - startedAt))
      const tenth = Math.ceil(left / 100)
      if (tenth !== last) {
        last = tenth
        setRemaining(left)
      }
      if (left <= 0) {
        if (!fired) {
          fired = true
          expire.current()
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [startedAt, durationMs])

  return remaining
}
