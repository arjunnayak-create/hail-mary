/**
 * The throw. A vertical, top-down pixel field: our goal line at the bottom, the QB on it, and
 * every answer thrown "downfield" (up the screen) to its tier's yard line. The camera follows
 * the ball; tier lines flash as it passes; the stadium gets louder and brighter with distance
 * (lights on, crowd standing, glowing end zone + fireworks for a Hail Mary).
 *
 * Canvas = low-res pixel art (P css px per virtual pixel). DOM overlay = crisp text that
 * moves with the camera (tier lines, facts, zone labels, the answer pill, TOUCHDOWN slam).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThrowSceneProps } from '../../ui/theme'
import { FIELD_FACTS, ZONES } from './copy'
import { drawDigits, drawSprite, noise2, rasterize, smoothstep } from './pixel'
import { sounds } from './sound'
import {
  BALL_SMALL, FOOTBALL_PAL, QB_FOLLOW, QB_IDLE, QB_WINDUP, RECEIVER, RECEIVER_CATCH, REF, REF_PAL, REF_TD, TEAM,
} from './sprites'
import { TierIcon } from './TierIcon'
import tiersJson from './tiers.json'

const TIERS = tiersJson.tiers
const WORLD_MIN = -14
const WORLD_MAX = 118
const QB_YARD = -1
const TD_TIER = Math.max(...TIERS.map((t) => t.tier))
/** Flight time per tier (s); deeper throws hang longer. */
const FLIGHT = [1.15, 1.6, 2.2, 2.7, 3.5]
/** Settle time after the catch before handing back to the UI (ms). */
const SETTLE = [650, 700, 800, 900, 2300]
/** Ball apex height in virtual pixels. */
const PEAK = [5, 10, 16, 22, 30]

const TURF = ['#2f8f3e', '#2a8238']
const CROWD = ['#ff4f8b', '#4fe3ff', '#ffd23f', '#e9ecf5', '#b77dff', '#ff8a4c', '#6be38a', '#2b2f55', '#3a3f70']

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

interface Sim {
  mode: ThrowSceneProps['mode']
  key: number
  start: number
  tier: number | null
  landYard: number
  shownYard: number
  rcvX: number
  passed: Set<number>
  landedAt: number | null
  doneFired: boolean
  cam: number
  particles: Particle[]
  trail: { x: number; y: number; h: number }[]
  lastFirework: number
}

export function FieldScene(props: ThrowSceneProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const you = useRef<HTMLDivElement>(null)
  const td = useRef<HTMLDivElement>(null)
  const lineEls = useRef(new Map<number, HTMLDivElement>())
  const revealEls = useRef<HTMLElement[]>([])
  const [dims, setDims] = useState({ w: 390, h: 600, P: 3 })
  const latest = useRef(props)
  latest.current = props

  const sim = useRef<Sim>({
    mode: 'idle', key: -1, start: 0, tier: null, landYard: 0, shownYard: 0, rcvX: 0, passed: new Set(),
    landedAt: null, doneFired: false, cam: WORLD_MIN, particles: [], trail: [], lastFirework: 0,
  })

  // ---- size
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setDims({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)), P: r.width >= 700 ? 4 : 3 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => {
    const vw = Math.ceil(dims.w / dims.P)
    const vh = Math.ceil(dims.h / dims.P)
    const ppy = Math.max(6, Math.round(Math.min(vw, 160) / 16)) // virtual px per yard
    const stand = Math.max(9, Math.round(vw * 0.1))
    return { vw, vh, ppy, ppyCss: ppy * dims.P, stand, fieldL: stand, fieldR: vw - stand, cx: Math.floor(vw / 2) }
  }, [dims])

  // ---- start a throw / miss when playKey changes
  useEffect(() => {
    const s = sim.current
    if (props.playKey === s.key && props.mode === s.mode) return
    const fresh = props.playKey !== s.key
    s.mode = props.mode
    s.key = props.playKey
    if (!fresh) return
    s.start = performance.now()
    s.tier = props.tier
    s.passed = new Set()
    s.landedAt = null
    s.doneFired = false
    s.particles = []
    s.trail = []
    const rule = TIERS.find((t) => t.tier === props.tier)
    s.shownYard = rule?.distance ?? 0
    s.landYard = props.tier === TD_TIER ? 104 : s.shownYard
    const side = (props.playKey * 7919) % 2 === 0 ? -1 : 1
    s.rcvX = geo.cx + side * Math.round((geo.fieldR - geo.fieldL) * (0.12 + ((props.playKey * 31) % 10) / 60))
    revealEls.current.forEach((el) => el.classList.remove('is-on'))
    lineEls.current.forEach((el) => el.classList.remove('is-flash', 'is-passed'))
    td.current?.classList.remove('is-on')
    if (props.mode === 'throw') sounds.play('throw', { tier: props.tier })
  }, [props.playKey, props.mode, props.tier, geo])

  // ---- render loop
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const { vw, vh, ppy, ppyCss, fieldL, fieldR, cx } = geo
    const P = dims.P
    c.width = vw
    c.height = vh
    const img = {
      idle: rasterize(QB_IDLE, TEAM, 'qb-idle'),
      windup: rasterize(QB_WINDUP, TEAM, 'qb-windup'),
      follow: rasterize(QB_FOLLOW, TEAM, 'qb-follow'),
      rcv: rasterize(RECEIVER, TEAM, 'rcv'),
      catch: rasterize(RECEIVER_CATCH, TEAM, 'rcv-catch'),
      ball: rasterize(BALL_SMALL, FOOTBALL_PAL, 'ball-small'),
      ref: REF.map((f, i) => rasterize(f, REF_PAL, `ref-${i}`)),
      refTd: rasterize(REF_TD, REF_PAL, 'ref-td'),
    }
    let raf = 0
    let last = performance.now()

    const sy = (yard: number, cam: number) => vh - (yard - cam) * ppy // screen y (virtual px)

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = sim.current
      const p = latest.current
      const visible = vh / ppy
      const idleCam = QB_YARD - (p.insetBottom + 22) / ppyCss
      const throwBase = QB_YARD - 30 / ppyCss
      const tierIdx = Math.max(0, (s.tier ?? 1) - 1)

      // ---- ball kinematics
      let ground = QB_YARD + 0.6
      let height = 0
      let ballX = cx + 3
      let qbPose: HTMLCanvasElement = img.idle
      let holding = true
      const elapsed = (now - s.start) / 1000
      const speed = p.reducedMotion ? 2 : 1
      if (s.mode === 'throw') {
        const windup = 0.22 / speed
        const dur = FLIGHT[tierIdx] / speed
        const t = Math.min(1, Math.max(0, (elapsed - windup) / dur))
        holding = elapsed < windup
        qbPose = holding ? img.windup : elapsed < windup + 0.5 ? img.follow : img.idle
        if (!holding) {
          const ease = s.tier === TD_TIER ? 1 - Math.pow(1 - t, 3.2) : 1 - Math.pow(1 - t, 2.3)
          ground = QB_YARD + 0.6 + (s.landYard - QB_YARD - 0.6) * ease
          height = PEAK[tierIdx] * Math.sin(Math.PI * Math.min(1, t * 1.02))
          ballX = cx + 3 + (s.rcvX - cx - 3) * ease
          if (t >= 1 && s.landedAt === null) {
            s.landedAt = now
            sounds.play('land', { tier: s.tier })
            if (s.tier === TD_TIER) {
              sounds.play('jackpot')
              td.current?.classList.add('is-on')
            }
          }
        }
      } else if (s.mode === 'miss') {
        const t = Math.min(1, elapsed / (1.0 / speed))
        qbPose = elapsed < 0.3 ? img.follow : img.idle
        holding = false
        ground = QB_YARD + 0.6 + 4 * (1 - Math.pow(1 - t, 2))
        height = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 9
        ballX = cx + 3 + t * 10
        if (t >= 1 && s.landedAt === null) s.landedAt = now
      }

      // ---- camera
      let camTarget = idleCam
      if (s.mode === 'throw') camTarget = Math.max(throwBase, ground - visible * 0.36)
      if (s.mode === 'miss') camTarget = throwBase
      camTarget = Math.min(camTarget, WORLD_MAX - visible)
      camTarget = Math.max(camTarget, WORLD_MIN)
      const k = s.mode === 'throw' ? 14 : 6
      s.cam += (camTarget - s.cam) * (1 - Math.exp(-dt * k))
      if (Math.abs(camTarget - s.cam) < 0.001) s.cam = camTarget
      const cam = s.cam
      const camMid = cam + visible / 2
      const camTop = cam + visible

      // ---- progress callbacks + line flashes
      const shown = s.mode === 'throw' ? Math.max(0, Math.min(s.shownYard, ground)) : 0
      p.onDistance?.(shown)
      if (s.mode === 'throw') {
        TIERS.forEach((t, i) => {
          if (t.distance <= s.shownYard && ground >= t.distance && !s.passed.has(t.distance)) {
            s.passed.add(t.distance)
            const el = lineEls.current.get(t.distance)
            if (el) {
              el.classList.remove('is-flash')
              void el.offsetWidth
              el.classList.add('is-flash', 'is-passed')
            }
            sounds.play('linePass', { index: i })
          }
        })
        revealEls.current.forEach((el) => {
          if (ground >= Number(el.dataset.yard) - 6) el.classList.add('is-on')
        })
      }
      if (s.landedAt !== null && !s.doneFired) {
        const settle = s.mode === 'miss' ? 350 : SETTLE[tierIdx]
        if (now - s.landedAt > settle / speed) {
          s.doneFired = true
          p.onDone?.()
        }
      }

      // ---- scenery intensity
      const night = smoothstep(12, 62, camMid)
      const standUp = smoothstep(52, 80, camMid) + (s.tier === TD_TIER && s.landedAt ? 1 : 0)
      const glow = smoothstep(80, 104, camTop)
      const flashRate = 0.0004 + 0.004 * smoothstep(20, 100, camMid) + (s.landedAt && s.tier === TD_TIER ? 0.02 : 0)

      // ---- draw: background wall
      ctx.fillStyle = '#0d1230'
      ctx.fillRect(0, 0, vw, vh)

      // turf stripes / end zones (one pass per 5-yard band)
      const y0 = Math.floor(cam / 5) * 5 - 5
      for (let yard = y0; yard < camTop + 5; yard += 5) {
        const top = sy(yard + 5, cam)
        const h = 5 * ppy
        if (yard >= 0 && yard < 100) ctx.fillStyle = TURF[(yard / 5) % 2 === 0 ? 0 : 1]
        else if (yard >= -10 && yard < 0) ctx.fillStyle = '#26326e'
        else if (yard >= 100 && yard < 110) ctx.fillStyle = '#a92d63'
        else ctx.fillStyle = '#121838'
        ctx.fillRect(fieldL, Math.floor(top), fieldR - fieldL, Math.ceil(h) + 1)
      }
      // end zone diagonal stripes
      for (const [zoneStart, color] of [[-10, '#2d3a7c'], [100, '#bf3a72']] as const) {
        const top = sy(zoneStart + 10, cam)
        const bottom = sy(zoneStart, cam)
        if (bottom < 0 || top > vh) continue
        ctx.fillStyle = color
        for (let x = fieldL; x < fieldR; x++) {
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(vh, bottom); y++) {
            if ((x + y) % 8 < 2) ctx.fillRect(x, y, 1, 1)
          }
        }
      }
      // end zone glow (Hail Mary territory)
      if (glow > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180)
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgba(255, 90, 160, ${0.18 * glow * (0.6 + 0.4 * pulse)})`
        ctx.fillRect(fieldL, sy(110, cam), fieldR - fieldL, 10 * ppy)
        ctx.fillStyle = `rgba(255, 210, 63, ${0.1 * glow * pulse})`
        ctx.fillRect(fieldL, sy(110, cam), fieldR - fieldL, 10 * ppy)
        ctx.globalCompositeOperation = 'source-over'
      }

      // yard lines, hashes, numbers
      const first = Math.max(-10, Math.ceil(cam))
      for (let yard = first; yard <= Math.min(110, camTop + 1); yard++) {
        const y = Math.round(sy(yard, cam))
        if (yard % 5 === 0 && yard >= 0 && yard <= 100) {
          ctx.fillStyle = yard === 0 || yard === 100 ? '#ffffff' : 'rgba(255,255,255,0.78)'
          ctx.fillRect(fieldL, y, fieldR - fieldL, yard === 0 || yard === 100 ? 2 : 1)
        } else if (yard > 0 && yard < 100) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.fillRect(fieldL + 1, y, 2, 1)
          ctx.fillRect(fieldR - 3, y, 2, 1)
          ctx.fillRect(cx - Math.round((fieldR - fieldL) * 0.12), y, 2, 1)
          ctx.fillRect(cx + Math.round((fieldR - fieldL) * 0.12) - 1, y, 2, 1)
        }
        if (yard % 10 === 0 && yard > 0 && yard < 100) {
          const label = String(yard <= 50 ? yard : 100 - yard)
          drawDigits(ctx, label, fieldL + 7, y - 7, 'rgba(255,255,255,0.7)')
          drawDigits(ctx, label, fieldR - 7, y - 7, 'rgba(255,255,255,0.7)')
        }
      }
      // sidelines
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(fieldL, sy(110, cam), 1, 120 * ppy)
      ctx.fillRect(fieldR - 1, sy(110, cam), 1, 120 * ppy)
      // goal posts at the back of their end zone
      const gy = Math.round(sy(110, cam))
      if (gy > -4 && gy < vh) {
        ctx.fillStyle = '#ffd23f'
        ctx.fillRect(cx - 9, gy, 19, 1)
        ctx.fillRect(cx - 9, gy - 2, 1, 3)
        ctx.fillRect(cx + 9, gy - 2, 1, 3)
        ctx.fillRect(cx, gy, 1, 3)
      }

      // stands + crowd (seats in 2px rows; stable per world row so they scroll with the field)
      const seatRows = Math.ceil(vh / 2) + 1
      const camPx = Math.floor(cam * ppy)
      const bounce = standUp > 0 ? Math.floor(now / 140) % 2 : 0
      for (const [x0, x1] of [[0, fieldL - 1], [fieldR + 1, vw]] as const) {
        ctx.fillStyle = '#141a3d'
        ctx.fillRect(x0, 0, x1 - x0, vh)
        for (let r = 0; r < seatRows; r++) {
          const worldRow = Math.floor((camPx + (vh - r * 2)) / 2)
          if (worldRow % 4 === 0) continue // aisle
          const y = r * 2
          for (let x = x0; x < x1; x++) {
            const n = noise2(x, worldRow)
            if (n < 0.12) continue
            const up = standUp > 0.15 && noise2(x + 3, worldRow) < standUp * 0.8 ? bounce : 0
            const flash = Math.random() < flashRate
            ctx.fillStyle = flash ? '#ffffff' : CROWD[Math.floor(n * CROWD.length)]
            ctx.fillRect(x, y - up, 1, 1)
          }
        }
        ctx.fillStyle = '#0b0f26'
        ctx.fillRect(x0 === 0 ? x1 : x0 - 1, 0, 1, vh) // wall at the sideline
      }

      // ---- night: darken, then stadium lights pool onto the field
      if (night > 0) {
        ctx.fillStyle = `rgba(6, 8, 32, ${0.5 * night})`
        ctx.fillRect(0, 0, vw, vh)
        ctx.globalCompositeOperation = 'lighter'
        for (let yard = 10; yard <= 100; yard += 30) {
          const y = sy(yard, cam)
          if (y < -60 || y > vh + 60) continue
          for (const lx of [fieldL - 4, fieldR + 4]) {
            const g = ctx.createRadialGradient(lx, y, 1, lx, y, 46)
            g.addColorStop(0, `rgba(255, 244, 214, ${0.55 * night})`)
            g.addColorStop(1, 'rgba(255, 244, 214, 0)')
            ctx.fillStyle = g
            ctx.fillRect(lx - 46, y - 46, 92, 92)
            ctx.fillStyle = `rgba(255,255,240,${night})`
            ctx.fillRect(lx - 2, y - 1, 4, 2) // the light bank
          }
        }
        ctx.globalCompositeOperation = 'source-over'
      }

      // ---- sprites
      const qbY = sy(QB_YARD, cam)
      drawSprite(ctx, qbPose, cx, qbY)
      if (s.mode === 'throw') {
        const ry = sy(s.landYard + 0.4, cam)
        if (ry > -20 && ry < vh + 20) drawSprite(ctx, s.landedAt ? img.catch : img.rcv, s.rcvX, ry)
        if (s.tier === TD_TIER && s.landedAt) {
          const refY = sy(100.5, cam)
          drawSprite(ctx, img.refTd, fieldR - 12, refY)
        }
      } else {
        // the ref waits near the 5
        const refFrame = img.ref[Math.floor(now / 500) % 2]
        drawSprite(ctx, refFrame, fieldR - 12, sy(4, cam))
      }

      // ball: always level (no spin), with a motion streak behind it like the app icon
      const by = sy(ground, cam)
      const scale = height > 16 ? 2 : 1
      if (s.mode === 'throw' && !holding && !s.landedAt) {
        s.trail.push({ x: ballX, y: ground, h: height })
        if (s.trail.length > 16) s.trail.shift()
        const bands = ['#3fd6ff', '#ff4f8b', '#7a2a55'] // cyan, pink, dark pink (favicon streak)
        s.trail.forEach((pt, i) => {
          if (i === s.trail.length - 1) return
          const a = ((i + 1) / s.trail.length) * 0.85
          const x = Math.round(pt.x)
          const y = Math.round(sy(pt.y, cam) - pt.h * 0.6) - 2
          ctx.globalAlpha = a
          bands.forEach((col, k) => {
            ctx.fillStyle = col
            ctx.fillRect(x - 1 + k, y, 1, 2)
          })
        })
        ctx.globalAlpha = 1
      }
      if (!holding) {
        const caught = s.landedAt !== null && s.mode === 'throw'
        if (!caught) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          const sw = 4 + scale * 2
          ctx.fillRect(Math.round(ballX + height * 0.35 - sw / 2), Math.round(by), sw, 1)
          drawSprite(ctx, img.ball, ballX, by - height * 0.6, scale)
        }
      }

      // ---- particles (fireworks / confetti for the TD)
      if (s.tier === TD_TIER && s.landedAt && now - s.lastFirework > 260 && now - s.landedAt < 2200) {
        s.lastFirework = now
        const fx = fieldL + 8 + Math.random() * (fieldR - fieldL - 16)
        const fy = 104 + Math.random() * 10
        const col = CROWD[Math.floor(Math.random() * 6)]
        for (let i = 0; i < 26; i++) {
          const ang = (i / 26) * Math.PI * 2
          const sp = 14 + Math.random() * 10
          s.particles.push({ x: fx, y: fy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp / ppy, life: 0, max: 0.9 + Math.random() * 0.4, color: col })
        }
      }
      s.particles = s.particles.filter((pt) => pt.life < pt.max)
      for (const pt of s.particles) {
        pt.life += dt
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.vy -= 1.2 * dt // gravity (yards/s^2, up the field = positive)
        pt.vx *= 0.97
        ctx.fillStyle = pt.color
        ctx.globalAlpha = 1 - pt.life / pt.max
        ctx.fillRect(Math.round(pt.x), Math.round(sy(pt.y, cam)), 1, 1)
      }
      ctx.globalAlpha = 1

      // ---- spotlight vignette for deep throws
      if (s.mode === 'throw' && (s.tier ?? 0) >= 4) {
        const v = 0.78 * smoothstep(40, 72, ground) * (s.landedAt && s.tier === TD_TIER ? Math.max(0, 1 - (now - s.landedAt) / 600) : 1)
        if (v > 0.01) {
          const lx = s.landedAt ? s.rcvX : ballX
          const ly = s.landedAt ? sy(s.landYard, cam) - 6 : by - height * 0.6
          const g = ctx.createRadialGradient(lx, ly, 8, lx, ly, Math.max(vw, vh) * 0.55)
          g.addColorStop(0, 'rgba(0,0,0,0)')
          g.addColorStop(0.35, `rgba(2,3,12,${v * 0.6})`)
          g.addColorStop(1, `rgba(2,3,12,${v})`)
          ctx.fillStyle = g
          ctx.fillRect(0, 0, vw, vh)
        }
      }

      // ---- DOM overlay sync
      if (world.current) world.current.style.transform = `translate3d(0, ${(cam - WORLD_MIN) * ppyCss}px, 0)`
      if (pill.current) {
        const show = s.mode === 'throw'
        pill.current.style.opacity = show ? '1' : '0'
        if (show) {
          const px = (s.landedAt ? s.rcvX : ballX) * P
          // sit just above the ball sprite (6 virtual px tall, x2 near the apex) or the catcher
          const ballTop = by - height * 0.6 - BALL_SMALL.length * (height > 16 ? 2 : 1)
          const py = ((s.landedAt ? sy(s.landYard, cam) - 16 : ballTop - 3) * P)
          const w = pill.current.offsetWidth
          const clampedX = Math.min(Math.max(px - w / 2, 6), dims.w - w - 34)
          pill.current.style.transform = `translate3d(${clampedX}px, ${py - pill.current.offsetHeight}px, 0)`
        }
      }
      if (you.current) {
        const frac = s.mode === 'throw' ? Math.min(1, Math.max(0, ground / 110)) : 0
        you.current.style.top = `${(1 - frac) * 100}%`
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [geo, dims])

  const { ppyCss, fieldL, fieldR, stand } = geo
  const P = dims.P
  const yToBottom = (yard: number) => (yard - WORLD_MIN) * ppyCss
  const pillTier = TIERS.find((t) => t.tier === props.tier)

  revealEls.current = []
  const keepReveal = (el: HTMLElement | null) => {
    if (el) revealEls.current.push(el)
  }

  return (
    <div ref={wrap} className="field-scene">
      <canvas ref={canvas} className="field-canvas" style={{ width: geo.vw * P, height: geo.vh * P }} />
      <div
        ref={world}
        className="field-world"
        style={{ height: (WORLD_MAX - WORLD_MIN) * ppyCss, left: fieldL * P, width: (fieldR - fieldL) * P }}
      >
        {TIERS.map((t) => (
          <div
            key={t.tier}
            ref={(el) => {
              if (el) lineEls.current.set(t.distance, el)
            }}
            className="tier-line"
            style={{ bottom: yToBottom(t.distance), ['--c' as string]: t.color }}
          >
            <span className="tier-line-label">
              <TierIcon tier={t.tier} size={14} />
              {t.name.toUpperCase()} · {t.points}
            </span>
          </div>
        ))}
        {FIELD_FACTS.map((f, i) => (
          <div
            key={f.yard}
            ref={keepReveal}
            data-yard={f.yard}
            className={`field-fact ${i % 2 ? 'is-right' : 'is-left'}`}
            style={{ bottom: yToBottom(f.yard) }}
          >
            {f.text}
          </div>
        ))}
        {ZONES.map((z) => (
          <div key={z.yard} ref={keepReveal} data-yard={z.yard} className="field-zone" style={{ bottom: yToBottom(z.yard) }}>
            {z.text}
          </div>
        ))}
      </div>
      <div
        ref={pill}
        className="answer-pill"
        style={{ ['--c' as string]: pillTier?.color ?? '#fff', opacity: 0 }}
      >
        "{props.label.toUpperCase()}" ▼
      </div>
      <div ref={td} className="td-slam">TOUCHDOWN!</div>
      <div
        className="yard-ruler"
        style={{ top: props.insetTop + 8, bottom: props.insetBottom + 8, width: Math.max(22, stand * P - 6) }}
        aria-hidden
      >
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((y) => (
          <div key={y} className={`ruler-tick ${y % 50 === 0 ? 'is-major' : ''}`} style={{ top: `${(1 - y / 110) * 100}%` }}>
            {y === 100 ? 'TD' : y % 50 === 0 ? y : ''}
          </div>
        ))}
        <div ref={you} className="ruler-you" style={{ top: '100%' }}>
          YOU
        </div>
      </div>
    </div>
  )
}
