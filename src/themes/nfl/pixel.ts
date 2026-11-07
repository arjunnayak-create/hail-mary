/**
 * Pixel-art helpers: sprites are arrays of strings, one char per pixel, mapped through a
 * palette ('.' = transparent). Sprites are rasterized once to offscreen canvases.
 */

export type Sprite = readonly string[]
export type Palette = Record<string, string>

const cache = new Map<string, HTMLCanvasElement>()

export function rasterize(sprite: Sprite, palette: Palette, key: string): HTMLCanvasElement {
  const hit = cache.get(key)
  if (hit) return hit
  const w = Math.max(...sprite.map((r) => r.length))
  const c = document.createElement('canvas')
  c.width = w
  c.height = sprite.length
  const ctx = c.getContext('2d')!
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]]
      if (!col) continue
      ctx.fillStyle = col
      ctx.fillRect(x, y, 1, 1)
    }
  })
  cache.set(key, c)
  return c
}

/** Draw a sprite centered horizontally at x with its bottom at y (virtual pixels). */
export function drawSprite(
  ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, scale = 1, flip = false,
) {
  const w = img.width * scale
  const h = img.height * scale
  const dx = Math.round(x - w / 2)
  const dy = Math.round(y - h)
  if (flip) {
    ctx.save()
    ctx.translate(dx + w, dy)
    ctx.scale(-1, 1)
    ctx.drawImage(img, 0, 0, w, h)
    ctx.restore()
  } else {
    ctx.drawImage(img, dx, dy, w, h)
  }
}

// 3x5 digits for yard numbers
const DIGITS: Record<string, Sprite> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
}

export function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color
  let cx = Math.round(x - (text.length * 4 - 1) / 2)
  for (const ch of text) {
    const g = DIGITS[ch]
    if (g) g.forEach((row, ry) => [...row].forEach((p, rx) => p === '#' && ctx.fillRect(cx + rx, Math.round(y) + ry, 1, 1)))
    cx += 4
  }
}

/** Deterministic hash noise in [0, 1) for stable crowd colors etc. */
export function noise2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function mix(hexA: string, hexB: string, t: number): string {
  const a = parseInt(hexA.slice(1), 16)
  const b = parseInt(hexB.slice(1), 16)
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

export function hexMix(hexA: string, hexB: string, t: number): string {
  const a = parseInt(hexA.slice(1), 16)
  const b = parseInt(hexB.slice(1), 16)
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
}
