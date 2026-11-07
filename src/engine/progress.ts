/**
 * Persisted daily progress, streak and stats (pure functions; storage is separate).
 *
 * History is designed to be uploadable later (accounts): every completed game is a
 * self-contained record with a stable gameId, the device that played it, a timestamp, the
 * raw plays, and a snapshot of the score under the scoring rules at the time.
 */
import { scorePlays, totals } from './scoring'
import type { TierConfig } from './types'

export interface SavedPlay {
  promptId: string
  /** What the user typed for the accepted answer ('' for a miss). */
  guess: string
  answerId: string | null
  tier: number | null
}

export interface DayRecord {
  day: number
  promptIds: string[]
  plays: SavedPlay[]
  /** Index of a prompt whose clock had started when the page was last open. */
  activeIndex: number | null
  completed: boolean
  /** Filled in when the game completes. */
  result?: GameResult
}

export interface GameResult {
  /** Stable id: `${gameKey}:${day}` (e.g. "hailmary:0"). */
  gameId: string
  completedAt: string
  total: number
  base: number
  bonus: number
  /** Tier per play (null = miss), in prompt order. */
  tiers: (number | null)[]
}

export interface SaveState {
  version: 1
  /** Random per-device id, so local history can later be merged into an account. */
  deviceId: string
  days: Record<string, DayRecord>
  lastCompletedDay: number | null
  streak: number
  bestStreak: number
  muted: boolean
}

export function newDeviceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const emptySave = (): SaveState => ({
  version: 1, deviceId: newDeviceId(), days: {}, lastCompletedDay: null, streak: 0, bestStreak: 0, muted: false,
})

/** Attach the score snapshot to a completed game. */
export function finalizeDay(rec: DayRecord, cfg: TierConfig, gameKey: string, now = new Date()): DayRecord {
  if (!rec.completed || rec.result) return rec
  const scored = scorePlays(cfg, rec.plays)
  return {
    ...rec,
    result: { gameId: `${gameKey}:${rec.day}`, completedAt: now.toISOString(), ...totals(scored), tiers: rec.plays.map((p) => p.tier) },
  }
}

export interface Stats {
  played: number
  streak: number
  bestStreak: number
  average: number
  high: number
  /** Count per tier number across all games; key "miss" for incompletes. */
  tierCounts: Record<string, number>
  /** Last N completed games, oldest first. */
  history: { day: number; total: number }[]
}

export function computeStats(save: SaveState, today: number, cfg: TierConfig, historySize = 30): Stats {
  const games = Object.values(save.days)
    .filter((d) => d.completed)
    .sort((a, b) => a.day - b.day)
    .map((d) => d.result ?? finalizeDay(d, cfg, '').result!)
  const tierCounts: Record<string, number> = { miss: 0 }
  for (const t of cfg.tiers) tierCounts[t.tier] = 0
  for (const g of games) for (const t of g.tiers) tierCounts[t === null ? 'miss' : t] = (tierCounts[t === null ? 'miss' : t] ?? 0) + 1
  const totalsList = games.map((g) => g.total)
  const days = Object.values(save.days).filter((d) => d.completed).sort((a, b) => a.day - b.day).map((d) => d.day)
  return {
    played: games.length,
    streak: currentStreak(save, today),
    bestStreak: save.bestStreak,
    average: games.length ? Math.round(totalsList.reduce((a, b) => a + b, 0) / games.length) : 0,
    high: games.length ? Math.max(...totalsList) : 0,
    tierCounts,
    history: games.slice(-historySize).map((g, i) => ({ day: days.slice(-historySize)[i], total: g.total })),
  }
}

export function startDay(save: SaveState, day: number, promptIds: string[]): DayRecord {
  const existing = save.days[day]
  if (existing && existing.promptIds.join() === promptIds.join()) return existing
  return { day, promptIds, plays: [], activeIndex: null, completed: false }
}

/**
 * On load: a prompt whose clock was running when the page closed counts as a miss, so a
 * reload can't be used to dodge the timer.
 */
export function resumeDay(rec: DayRecord): DayRecord {
  if (rec.completed || rec.activeIndex === null || rec.activeIndex !== rec.plays.length) return rec
  const plays = [...rec.plays, { promptId: rec.promptIds[rec.activeIndex], guess: '', answerId: null, tier: null }]
  return { ...rec, plays, activeIndex: null, completed: plays.length >= rec.promptIds.length }
}

export function recordPlay(rec: DayRecord, play: SavedPlay): DayRecord {
  if (rec.completed) return rec
  const plays = [...rec.plays, play]
  return { ...rec, plays, activeIndex: null, completed: plays.length >= rec.promptIds.length }
}

/** Apply a newly completed day to the streak. */
export function completeDay(save: SaveState, rec: DayRecord): SaveState {
  const days = { ...save.days, [rec.day]: rec }
  if (!rec.completed || save.lastCompletedDay === rec.day) return { ...save, days }
  const streak = save.lastCompletedDay === rec.day - 1 ? save.streak + 1 : 1
  return {
    ...save, days, lastCompletedDay: rec.day, streak, bestStreak: Math.max(save.bestStreak, streak),
  }
}

/** Streak to display today: it breaks if yesterday was skipped. */
export function currentStreak(save: SaveState, today: number): number {
  if (save.lastCompletedDay === null) return 0
  return save.lastCompletedDay >= today - 1 ? save.streak : 0
}
