/**
 * Daily game selection. Everyone gets the same prompts on the same calendar day in the
 * game's time zone, with no server: the prompt pool is shuffled per "cycle" with a seeded
 * PRNG, so no prompt repeats until the whole pool has been used.
 */
import { hashString, mulberry32, seededShuffle } from './rng'

export interface DailyConfig {
  /** Day #1, as YYYY-MM-DD in `timeZone`. */
  epoch: string
  timeZone: string
  perDay: number
  /** Max prompts of one category on a single day; `default` applies to unlisted ones. */
  maxPerCategory: Record<string, number> & { default: number }
  /** Changing the salt reshuffles every future day. */
  salt: string
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function keyToUtcDays(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** 0-based day index since the epoch (game number = index + 1). */
export function dayIndex(date: Date, cfg: Pick<DailyConfig, 'epoch' | 'timeZone'>): number {
  return keyToUtcDays(dateKey(date, cfg.timeZone)) - keyToUtcDays(cfg.epoch)
}

/** Milliseconds until the calendar day changes in `timeZone`. */
export function msUntilNextDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000 + now.getMilliseconds()
  return Math.max(1000, 86_400_000 - elapsed)
}

interface PoolItem {
  id: string
  category: string
}

/** One cycle's ordering: a seeded shuffle, reordered so each day respects category caps. */
function cycleOrder(pool: readonly PoolItem[], cycle: number, cfg: DailyConfig): string[] {
  const rand = mulberry32(hashString(`${cfg.salt}:cycle:${cycle}`))
  const remaining = seededShuffle([...pool].sort((a, b) => a.id.localeCompare(b.id)), rand)
  const out: string[] = []
  while (remaining.length) {
    const day: PoolItem[] = []
    while (day.length < cfg.perDay && remaining.length) {
      const counts = (c: string) => day.filter((p) => p.category === c).length
      const cap = (c: string) => cfg.maxPerCategory[c] ?? cfg.maxPerCategory.default
      let i = remaining.findIndex((p) => counts(p.category) < cap(p.category))
      if (i < 0) i = 0 // caps can't be met (end of a cycle): take the next one anyway
      day.push(remaining.splice(i, 1)[0])
    }
    out.push(...day.map((p) => p.id))
  }
  return out
}

/** Prompt ids for a day. Deterministic for (pool, day, config). */
export function dailyPromptIds(pool: readonly PoolItem[], day: number, cfg: DailyConfig): string[] {
  const daysPerCycle = Math.max(1, Math.floor(pool.length / cfg.perDay))
  const cycle = Math.floor(day / daysPerCycle)
  const slot = ((day % daysPerCycle) + daysPerCycle) % daysPerCycle
  return cycleOrder(pool, cycle, cfg).slice(slot * cfg.perDay, slot * cfg.perDay + cfg.perDay)
}
