/**
 * The contract between the generic game UI (src/ui) and a theme (src/themes/<name>).
 * A new game = a new theme folder implementing this + its own data pipeline.
 */
import { createContext, useContext, type FC } from 'react'
import type { DailyConfig } from '../engine/daily'
import type { TierConfig } from '../engine/types'

export type SoundName =
  | 'click' | 'start' | 'countdown' | 'go' | 'tick' | 'wrong' | 'throw' | 'linePass'
  | 'land' | 'reveal' | 'jackpot' | 'miss' | 'end'

export interface ThemeSounds {
  unlock(): void
  setMuted(muted: boolean): void
  play(name: SoundName, opts?: { tier?: number | null; index?: number }): void
}

/** Rating band on the end screen ("The Bearing"). */
export interface ScoreBand {
  min: number
  title: string
  text: string
}

export interface ThemeCopy {
  title: string
  subtitle: string
  tagline: string
  cta: string
  resume: (n: number, of: number) => string
  gameLabel: string
  streakLabel: string
  howToPlay: string[]
  distanceLabel: string
  distanceUnit: string
  scoreLabel: string
  pointsUnit: string
  promptLabel: (n: number, of: number) => string
  promptHint: string
  preCountdown: string
  placeholder: string
  submit: string
  wrong: (guess: string) => string
  outOfRange: (guess: string) => string
  ambiguous: (guess: string) => string
  multiplierLabel: string
  next: string
  final: string
  missTitle: string
  completeTitle: (n: number) => string
  logTitle: string
  logSubtitle: string
  bandsTitle: string
  copyResult: string
  share: string
  copied: string
  catchTitle: string
  catchSubtitle: string
  rarestLabel: string
  nextGameIn: string
  shareTitle: string
  credits: string[]
}

export interface ThrowSceneProps {
  /** idle: waiting at the line; throw: answer in flight; miss: incomplete. */
  mode: 'idle' | 'throw' | 'miss'
  /** Changes for every new throw/miss so the scene restarts its animation. */
  playKey: number
  tier: number | null
  /** Text carried by the projectile (the accepted answer). */
  label: string
  /** Screen space covered by UI (css px) so the idle scene frames itself in the gap. */
  insetTop: number
  insetBottom: number
  reducedMotion: boolean
  /** Live distance during a throw (for the HUD). */
  onDistance?: (d: number) => void
  /** The throw / miss animation finished. */
  onDone?: () => void
}

export interface TierIconProps {
  tier: number | null
  size?: number
  glow?: boolean
}

export interface Theme {
  /** Storage namespace. */
  id: string
  daily: DailyConfig
  secondsPerPrompt: number
  countdownSeconds: number
  dataUrl: string
  namesUrl: string
  shareUrl: string
  tiers: TierConfig
  copy: ThemeCopy
  bands: ScoreBand[]
  sounds: ThemeSounds
  /** CSS custom properties applied to the app root (palette, fonts). */
  cssVars: Record<string, string>
  Backdrop: FC<{ variant: 'home' | 'end' }>
  ThrowScene: FC<ThrowSceneProps>
  TierIcon: FC<TierIconProps>
}

export const ThemeContext = createContext<Theme | null>(null)

export function useTheme(): Theme {
  const t = useContext(ThemeContext)
  if (!t) throw new Error('ThemeContext missing')
  return t
}
