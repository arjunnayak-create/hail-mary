import { useEffect, useRef } from 'react'
import type { TierIconProps } from '../../ui/theme'
import { hexMix } from './pixel'
import { ICONS } from './sprites'
import tiersJson from './tiers.json'

/** Glowing 12x12 pixel icon per tier, drawn into a tiny canvas and scaled up crisply. */
export function TierIcon({ tier, size = 24, glow = false }: TierIconProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rule = tier === null ? null : tiersJson.tiers.find((t) => t.tier === tier)
  const color = rule?.color ?? tiersJson.miss.color

  useEffect(() => {
    const c = ref.current
    if (!c || !rule) return
    const sprite = ICONS[rule.icon]
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, 12, 12)
    const pal: Record<string, string> = {
      o: '#0b0f1e', C: color, L: hexMix(color, '#ffffff', 0.55), D: hexMix(color, '#000000', 0.4), W: '#ffffff',
    }
    sprite.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!pal[ch]) return
      ctx.fillStyle = pal[ch]
      ctx.fillRect(x, y, 1, 1)
    }))
  }, [rule, color])

  if (!rule) {
    // miss: empty dotted circle
    return (
      <span
        aria-label="incomplete"
        style={{
          width: size, height: size, display: 'inline-block', borderRadius: '50%',
          border: `2px dotted ${color}`, boxSizing: 'border-box', flex: 'none',
        }}
      />
    )
  }
  return (
    <canvas
      ref={ref}
      width={12}
      height={12}
      aria-label={rule.name}
      className={glow ? 'icon-glow' : undefined}
      style={{
        width: size, height: size, imageRendering: 'pixelated', flex: 'none',
        ['--glow' as string]: color,
      }}
    />
  )
}
