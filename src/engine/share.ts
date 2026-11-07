/** Spoiler-free share text and the native share sheet / clipboard. */
import type { TierConfig } from './types'
import type { ScoredPlay } from './scoring'

export interface ShareInput {
  title: string
  gameNumber: number
  total: number
  unit: string
  plays: readonly ScoredPlay[]
  url: string
}

/** Exactly one emoji per play: the tier emoji, or the miss emoji. */
export function shareEmojis(cfg: TierConfig, plays: readonly ScoredPlay[]): string {
  return plays.map((p) => (p.tier === null ? cfg.miss.emoji : cfg.tiers.find((t) => t.tier === p.tier)?.emoji ?? '?')).join('')
}

/** "<title> #N · 348 pts · 🔥×2" (the streak part is omitted when no play was multiplied). */
export function buildShareText(cfg: TierConfig, s: ShareInput): string {
  const hot = s.plays.filter((p) => p.multiplier > 1).length
  const head = [`${s.title} #${s.gameNumber}`, `${s.total} ${s.unit}`, ...(hot ? [`${cfg.streakBonus.emoji}×${hot}`] : [])]
  return `${head.join(' · ')}\n${shareEmojis(cfg, s.plays)}\n${s.url}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // older iOS: hidden textarea fallback
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Native share sheet when available (phones), else copy. Returns what happened. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}
