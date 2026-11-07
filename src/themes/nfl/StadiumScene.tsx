/**
 * Home / end-screen backdrop: a pixel stadium at dusk (home) or under the lights (end),
 * seen from the field. Ambient life: drifting clouds and blimp, flickering crowd with
 * camera flashes, waving flags, the ref pacing the goal line, the QB waiting.
 */
import { useEffect, useRef } from 'react'
import { drawSprite, hexMix, noise2, rasterize } from './pixel'
import { BLIMP, BLIMP_PAL, QB_IDLE, REF, REF_PAL, TEAM } from './sprites'

const P = 3
const CROWD = ['#ff4f8b', '#4fe3ff', '#ffd23f', '#e9ecf5', '#b77dff', '#ff8a4c', '#2b2f55', '#3a3f70']

export function StadiumScene({ variant }: { variant: 'home' | 'end' }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    let vw = 0
    let vh = 0
    const resize = () => {
      const r = c.parentElement!.getBoundingClientRect()
      vw = Math.ceil(r.width / P)
      vh = Math.ceil(r.height / P)
      c.width = vw
      c.height = vh
      c.style.width = `${vw * P}px`
      c.style.height = `${vh * P}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c.parentElement!)
    const qb = rasterize(QB_IDLE, TEAM, 'qb-idle')
    const refs = REF.map((f, i) => rasterize(f, REF_PAL, `ref-${i}`))
    const blimp = rasterize(BLIMP, BLIMP_PAL, 'blimp')
    const night = variant === 'end'
    const crowdLit = CROWD.map((col) => hexMix(col, '#0b0d24', night ? 0 : 0.25))
    let raf = 0
    const t0 = performance.now()

    const sky = night
      ? ['#05061a', '#0a0c2a', '#11143c', '#1a1b4d', '#271f5c']
      : ['#140b33', '#2b1350', '#55206a', '#8c2f73', '#c9476f', '#f06b5e', '#ff9a55']

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      const horizon = Math.round(vh * 0.56)
      // banded pixel sky
      const band = Math.ceil(horizon / sky.length)
      sky.forEach((col, i) => {
        ctx.fillStyle = col
        ctx.fillRect(0, i * band, vw, band + 1)
        if (i < sky.length - 1) {
          ctx.fillStyle = sky[i + 1]
          for (let x = 0; x < vw; x += 2) ctx.fillRect(x + (i % 2), (i + 1) * band - 1, 1, 1) // dither
        }
      })
      if (night) {
        for (let i = 0; i < 70; i++) {
          const x = Math.floor(noise2(i, 1) * vw)
          const y = Math.floor(noise2(i, 2) * horizon * 0.8)
          ctx.fillStyle = noise2(i, Math.floor(t * 2)) > 0.9 ? '#ffffff' : '#8b90c8'
          ctx.fillRect(x, y, 1, 1)
        }
      } else {
        // retro sun, banded, sinking behind the stadium
        const sr = Math.round(Math.min(vw, vh) * 0.17)
        const scx = Math.round(vw * 0.62)
        const scy = horizon - Math.round(sr * 0.3)
        for (let y = -sr; y <= sr; y++) {
          const w = Math.round(Math.sqrt(sr * sr - y * y))
          const gap = y > 0 && y % 4 < Math.min(3, 1 + y / (sr / 3))
          if (gap) continue
          ctx.fillStyle = y < -sr / 3 ? '#ffe27a' : y < sr / 4 ? '#ffb85c' : '#ff7a59'
          ctx.fillRect(scx - w, scy + y, w * 2, 1)
        }
      }
      // clouds
      for (let i = 0; i < 4; i++) {
        const speed = 2 + i
        const w = 18 + i * 6
        const x = ((noise2(i, 9) * vw + t * speed) % (vw + w * 2)) - w
        const y = Math.round(horizon * (0.15 + 0.17 * i))
        ctx.fillStyle = night ? 'rgba(80,90,150,0.35)' : 'rgba(255,190,210,0.55)'
        ctx.fillRect(Math.round(x), y, w, 2)
        ctx.fillRect(Math.round(x + 4), y - 2, w - 9, 2)
        ctx.fillRect(Math.round(x + 9), y - 3, w - 18, 1)
      }
      // blimp drifting across
      const bx = ((t * 6) % (vw + 60)) - 30
      const by = Math.round(horizon * 0.22 + Math.sin(t * 0.8) * 2)
      drawSprite(ctx, blimp, bx, by)
      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = '#ff3355'
        ctx.fillRect(Math.round(bx) - 11, by - 4, 1, 1)
      }

      // stadium: upper deck silhouette
      const deckTop = horizon - Math.round(vh * 0.1)
      ctx.fillStyle = night ? '#0b0d24' : '#1b1236'
      ctx.beginPath()
      ctx.moveTo(0, deckTop - 6)
      ctx.quadraticCurveTo(vw / 2, deckTop + 4, vw, deckTop - 6)
      ctx.lineTo(vw, vh)
      ctx.lineTo(0, vh)
      ctx.fill()
      // light towers
      for (const lx of [Math.round(vw * 0.12), Math.round(vw * 0.88)]) {
        ctx.fillStyle = '#0b0d24'
        ctx.fillRect(lx, deckTop - 34, 2, 34)
        ctx.fillStyle = night ? '#fffbe6' : '#ffe9b0'
        ctx.fillRect(lx - 5, deckTop - 40, 12, 6)
        ctx.fillStyle = '#0b0d24'
        for (let k = 0; k < 4; k++) ctx.fillRect(lx - 4 + k * 3, deckTop - 40, 1, 6)
        const g = ctx.createRadialGradient(lx + 1, deckTop - 37, 2, lx + 1, deckTop - 37, 40)
        g.addColorStop(0, night ? 'rgba(255,250,220,0.5)' : 'rgba(255,230,180,0.3)')
        g.addColorStop(1, 'rgba(255,230,180,0)')
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = g
        ctx.fillRect(lx - 40, deckTop - 77, 82, 80)
        ctx.globalCompositeOperation = 'source-over'
      }
      // flags on the rim
      for (let i = 0; i < 6; i++) {
        const fx = Math.round(vw * (0.2 + i * 0.12))
        const fy = deckTop - 6 + Math.round(Math.abs(i - 2.5) * 1.2)
        ctx.fillStyle = '#0b0d24'
        ctx.fillRect(fx, fy - 9, 1, 9)
        ctx.fillStyle = CROWD[i % 5]
        for (let k = 0; k < 6; k++) {
          const wave = Math.round(Math.sin(t * 6 + k * 0.9 + i) * 1)
          ctx.fillRect(fx + 1 + k, fy - 9 + wave, 1, 3)
        }
      }
      // crowd rows
      const crowdTop = deckTop + 2
      const crowdBottom = Math.round(vh * 0.74)
      for (let y = crowdTop; y < crowdBottom; y += 2) {
        if ((y - crowdTop) % 8 === 6) continue
        for (let x = 0; x < vw; x++) {
          const n = noise2(x, y)
          if (n < 0.15) continue
          const flash = Math.random() < 0.0012
          ctx.fillStyle = flash ? '#ffffff' : crowdLit[Math.floor(n * CROWD.length)]
          const jump = n > 0.93 && Math.floor(t * 3 + n * 10) % 2 === 0 ? 1 : 0
          ctx.fillRect(x, y - jump, 1, 1)
        }
      }
      // wall + field
      ctx.fillStyle = '#ff4f8b'
      ctx.fillRect(0, crowdBottom, vw, 1)
      ctx.fillStyle = '#10142f'
      ctx.fillRect(0, crowdBottom + 1, vw, 3)
      const fieldTop = crowdBottom + 4
      for (let y = fieldTop; y < vh; y++) {
        ctx.fillStyle = Math.floor((y - fieldTop) / 4) % 2 ? '#2a8238' : '#2f8f3e'
        ctx.fillRect(0, y, vw, 1)
      }
      if (night) {
        ctx.fillStyle = 'rgba(6,8,32,0.35)'
        ctx.fillRect(0, fieldTop, vw, vh - fieldTop)
      }
      // perspective yard lines
      const vx = vw / 2
      for (let i = -6; i <= 6; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        for (let y = fieldTop; y < vh; y++) {
          const f = (y - fieldTop) / (vh - fieldTop)
          const x = Math.round(vx + i * (14 + f * 30))
          ctx.fillRect(x, y, 1, 1)
        }
      }
      // goal line (thick) near the bottom, the QB on it, the ref pacing
      const gl = Math.round(vh * 0.93)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, gl, vw, 2)
      drawSprite(ctx, qb, Math.round(vw / 2), gl + 1 + (Math.floor(t * 1.6) % 2))
      const walk = (Math.sin(t * 0.35) + 1) / 2
      const rx = Math.round(vw * (0.15 + walk * 0.25))
      drawSprite(ctx, refs[Math.floor(t * 4) % 2], rx, gl - 4, 1, Math.cos(t * 0.35) < 0)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [variant])

  return (
    <div className="stadium-scene">
      <canvas ref={canvas} />
    </div>
  )
}
