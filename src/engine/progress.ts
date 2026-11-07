/** Persisted daily progress and streak logic (pure functions; storage is separate). */

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
}

export interface SaveState {
  version: 1
  days: Record<string, DayRecord>
  lastCompletedDay: number | null
  streak: number
  bestStreak: number
  muted: boolean
}

export const emptySave = (): SaveState => ({
  version: 1, days: {}, lastCompletedDay: null, streak: 0, bestStreak: 0, muted: false,
})

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
