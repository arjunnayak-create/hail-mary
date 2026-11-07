/** Points, distance and the No Huddle streak multiplier. */
import type { TierConfig, TierRule } from './types'

export interface PlayResult {
  /** Rarity tier of the accepted answer, or null for a miss / timeout. */
  tier: number | null
}

export interface ScoredPlay {
  tier: number | null
  base: number
  multiplier: number
  points: number
  /** Length of the No Huddle streak including this play (0 if it doesn't qualify). */
  streak: number
}

export function tierRule(cfg: TierConfig, tier: number): TierRule {
  const t = cfg.tiers.find((x) => x.tier === tier)
  if (!t) throw new Error(`unknown tier ${tier}`)
  return t
}

export function maxBaseScore(cfg: TierConfig, plays: number): number {
  return Math.max(...cfg.tiers.map((t) => t.points)) * plays
}

/** Score one play given the streak length before it. */
export function scorePlay(cfg: TierConfig, tier: number | null, streakBefore: number): ScoredPlay {
  if (tier === null) return { tier, base: cfg.miss.points, multiplier: 1, points: cfg.miss.points, streak: 0 }
  const base = tierRule(cfg, tier).points
  if (tier < cfg.noHuddle.minTier) return { tier, base, multiplier: 1, points: base, streak: 0 }
  const streak = streakBefore + 1
  const m = cfg.noHuddle.multipliers
  const multiplier = m[Math.min(streak, m.length) - 1]
  return { tier, base, multiplier, points: Math.round(base * multiplier), streak }
}

/** Score a whole sequence of plays in order. */
export function scorePlays(cfg: TierConfig, plays: readonly PlayResult[]): ScoredPlay[] {
  const out: ScoredPlay[] = []
  let streak = 0
  for (const p of plays) {
    const s = scorePlay(cfg, p.tier, streak)
    streak = s.streak
    out.push(s)
  }
  return out
}

export function totals(scored: readonly ScoredPlay[]) {
  const total = scored.reduce((a, s) => a + s.points, 0)
  const base = scored.reduce((a, s) => a + s.base, 0)
  return { total, base, bonus: total - base }
}
