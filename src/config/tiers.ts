import raw from './tiers.json'

export type TierNumber = 1 | 2 | 3 | 4 | 5

export interface Tier {
  tier: TierNumber
  name: string
  yards: number
  /** Head tiers: fraction of the whole answer list (most famous first)... */
  share?: number
  /** ...capped at this many answers. */
  maxAnswers?: number
  /** Tail tiers: fraction of the answers left after the head tiers. */
  restShare?: number
  emoji: string
  meaning: string
}

export const TIERS = raw.tiers as Tier[]
export const INCOMPLETE = raw.incomplete
export const TOUCHDOWN_YARDS = raw.touchdownYards

export function getTier(tier: TierNumber): Tier {
  const t = TIERS.find((x) => x.tier === tier)
  if (!t) throw new Error(`Unknown tier ${tier}`)
  return t
}
