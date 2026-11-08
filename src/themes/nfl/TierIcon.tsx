import { useEffect, useRef } from 'react'
import type { TierIconProps } from '../../ui/theme'
import { hexMix } from './pixel'
import { ICON_PALETTES, ICONS } from './sprites'
import tiersJson from './tiers.json'

/** Glowing pixel icon per tier (12x12, or the wide football), drawn crisply into a tiny canvas. */
export function TierIcon({ tier, size = 24, glow = false }: TierIconProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rule = tier === null ? null : tiersJson.tiers.find((t) => t.tier === tier)
  const color = rule?.color ?? tiersJson.miss.color

  const sprite = rule ? ICONS[rule.icon] : null
  const w = sprite ? Math.max(...sprite.map((r) => r.length)) : 12
  const h = sprite ? sprite.length : 12

  useEffect(() => {
    const c = ref.current
    if (!c || !rule || !sprite) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    const pal: Record<string, string> = ICON_PALETTES[rule.icon] ?? {
      o: '#0b0f1e', C: color, L: hexMix(color, '#ffffff', 0.55), D: hexMix(color, '#000000', 0.4), W: '#ffffff',
    }
    sprite.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!pal[ch]) return
      ctx.fillStyle = pal[ch]
      ctx.fillRect(x, y, 1, 1)
    }))
  }, [rule, color, sprite, w, h])

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
      width={w}
      height={h}
      aria-label={rule.name}
      className={glow ? 'icon-glow' : undefined}
      style={{
        // fit inside a size x size box, keeping the sprite's aspect (the football is wide)
        width: w >= h ? size : (size * w) / h, height: w >= h ? (size * h) / w : size,
        imageRendering: 'pixelated', flex: 'none', objectFit: 'contain',
        ['--glow' as string]: color,
      }}
    />
  )
}
