/** Generic data schema shared by every theme (public/data/prompts.json). */

export interface AnswerRef {
  id: string
  name: string
  aliases: string[]
  /** Accepted on its own when unambiguous within the prompt (e.g. a surname). */
  shortName?: string
  /** Optional fun fact shown on the reveal card / answer list. */
  blurb?: string
}

export interface Answer extends AnswerRef {
  /** 1 = most common ... N = rarest. */
  tier: number
}

export interface PromptData {
  id: string
  category?: string
  text?: string
  qualifier?: string
  /** Sorted most common first. */
  answers: Answer[]
  /** Entries that fit the prompt but fall outside its range ("before our time"). */
  outOfRange: AnswerRef[]
}

export interface Prompt extends PromptData {
  category: string
  text: string
  qualifier: string
}

export interface PromptsFile {
  version: number
  generatedAt: string
  meta?: Record<string, unknown>
  prompts: Prompt[]
}

// --------------------------------------------------------------------------- tier config

export interface TierRule {
  tier: number
  name: string
  points: number
  /** Where the answer lands in the theme's scene (e.g. distance units). */
  distance: number
  color: string
  emoji: string
  icon: string
  quip: string
  share?: number
  maxAnswers?: number
  restShare?: number
}

export interface TierConfig {
  tiers: TierRule[]
  miss: { name: string; points: number; emoji: string; color: string; quip: string }
  streakBonus: { minTier: number; multipliers: number[]; emoji: string }
}
