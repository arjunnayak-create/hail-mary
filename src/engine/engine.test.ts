import { describe, expect, it } from 'vitest'
import { dailyPromptIds, dateKey, dayIndex, msUntilNextDay, type DailyConfig } from './daily'
import { completeDay, currentStreak, emptySave, recordPlay, resumeDay, startDay } from './progress'
import { maxBaseScore, scorePlay, scorePlays, totals } from './scoring'
import { buildShareText, shareEmojis } from './share'
import type { TierConfig } from './types'

const cfg: TierConfig = {
  tiers: [1, 2, 3, 4, 5].map((tier, i) => ({
    tier, name: `T${tier}`, points: [10, 30, 60, 85, 100][i], distance: [10, 30, 60, 85, 100][i],
    color: '#fff', emoji: ['a', 'b', 'c', 'd', 'e'][i], icon: '', quip: '',
  })),
  miss: { name: 'miss', points: 0, emoji: 'x', color: '#000', quip: '' },
  streakBonus: { minTier: 3, multipliers: [1, 1.5, 2], emoji: '!' },
}
const tiers = (...t: (number | null)[]) => t.map((tier) => ({ tier }))

describe('scoring', () => {
  it('uses the tier point values, max 700 over 7 plays', () => {
    expect(scorePlays(cfg, tiers(1, 2)).map((s) => s.points)).toEqual([10, 30])
    expect(maxBaseScore(cfg, 7)).toBe(700)
    expect(scorePlay(cfg, null, 3)).toMatchObject({ points: 0, streak: 0, multiplier: 1 })
  })

  it('No Huddle: consecutive tier>=3 answers build 1x, 1.5x, then 2x (cap)', () => {
    const s = scorePlays(cfg, tiers(3, 3, 4, 5, 3))
    expect(s.map((x) => x.multiplier)).toEqual([1, 1.5, 2, 2, 2])
    expect(s.map((x) => x.points)).toEqual([60, 90, 170, 200, 120])
    expect(s.map((x) => x.streak)).toEqual([1, 2, 3, 4, 5])
  })

  it('a lower tier or a miss resets the streak', () => {
    const s = scorePlays(cfg, tiers(4, 4, 2, 4, null, 5, 5))
    expect(s.map((x) => x.multiplier)).toEqual([1, 1.5, 1, 1, 1, 1, 1.5])
    expect(totals(s)).toEqual({ total: 85 + 128 + 30 + 85 + 0 + 100 + 150, base: 85 + 85 + 30 + 85 + 100 + 100, bonus: 43 + 50 })
  })

  it('rounds fractional multiplied points', () => {
    expect(scorePlay(cfg, 4, 1).points).toBe(128) // 85 * 1.5 = 127.5
  })
})

describe('share text', () => {
  it('one emoji per play, a flame on multiplied plays, x for misses', () => {
    const s = scorePlays(cfg, tiers(1, 3, 4, null, 5))
    expect(shareEmojis(cfg, s)).toBe('acd!xe')
    expect(buildShareText(cfg, { title: 'G', gameNumber: 3, total: 300, unit: 'pts', plays: s, url: 'u' }))
      .toBe('G #3 — 300 pts\nacd!xe\nu')
  })
})

const daily: DailyConfig = {
  epoch: '2026-11-07', timeZone: 'America/New_York', perDay: 7,
  maxPerCategory: { default: 2, team: 3 }, salt: 'test',
}
const pool = Array.from({ length: 93 }, (_, i) => ({
  id: `p${i}`, category: i < 44 ? 'team' : ['a', 'b', 'c', 'd', 'e', 'f'][i % 6],
}))

describe('daily seed', () => {
  it('rolls over at midnight in the game time zone, not UTC', () => {
    // 11:30pm ET on Nov 7 is already Nov 8 in UTC
    const late = new Date('2026-11-08T04:30:00Z')
    expect(dateKey(late, 'America/New_York')).toBe('2026-11-07')
    expect(dayIndex(late, daily)).toBe(0)
    expect(dayIndex(new Date('2026-11-08T05:30:00Z'), daily)).toBe(1)
    expect(msUntilNextDay(late, 'America/New_York')).toBe(30 * 60 * 1000)
  })

  it('is deterministic and picks perDay distinct prompts', () => {
    const a = dailyPromptIds(pool, 5, daily)
    expect(a).toEqual(dailyPromptIds([...pool].reverse(), 5, daily)) // pool order doesn't matter
    expect(a).toHaveLength(7)
    expect(new Set(a).size).toBe(7)
    expect(dailyPromptIds(pool, 6, daily)).not.toEqual(a)
  })

  it('never repeats a prompt within a cycle, and respects category caps', () => {
    const days = Math.floor(pool.length / 7)
    const seen = new Set<string>()
    let capped = 0
    for (let d = 0; d < days; d++) {
      const ids = dailyPromptIds(pool, d, daily)
      for (const id of ids) {
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
      const cats = ids.map((id) => pool.find((p) => p.id === id)!.category)
      if (cats.filter((c) => c === 'team').length <= 3 && ['a', 'b', 'c', 'd', 'e', 'f'].every((c) => cats.filter((x) => x === c).length <= 2)) capped++
    }
    expect(capped).toBeGreaterThanOrEqual(days - 2) // the last day(s) of a cycle may overflow
  })

  it('changing the salt reshuffles', () => {
    expect(dailyPromptIds(pool, 0, { ...daily, salt: 'other' })).not.toEqual(dailyPromptIds(pool, 0, daily))
  })
})

describe('progress and streak', () => {
  const ids = ['a', 'b', 'c']
  const play = (promptId: string, tier: number | null) => ({ promptId, guess: 'x', answerId: tier ? 'id' : null, tier })

  it('completes a day after every prompt is played', () => {
    let rec = startDay(emptySave(), 0, ids)
    rec = recordPlay(recordPlay(rec, play('a', 1)), play('b', null))
    expect(rec.completed).toBe(false)
    rec = recordPlay(rec, play('c', 5))
    expect(rec.completed).toBe(true)
    expect(recordPlay(rec, play('c', 5)).plays).toHaveLength(3) // no extra plays
  })

  it('a reload with a running clock counts that prompt as a miss', () => {
    const rec = { ...recordPlay(startDay(emptySave(), 0, ids), play('a', 2)), activeIndex: 1 }
    const resumed = resumeDay(rec)
    expect(resumed.plays.map((p) => p.tier)).toEqual([2, null])
    expect(resumed.activeIndex).toBeNull()
  })

  it('streak grows on consecutive days and breaks on a skipped day', () => {
    const done = (day: number) => ({ day, promptIds: ids, plays: [], activeIndex: null, completed: true })
    let s = completeDay(emptySave(), done(3))
    s = completeDay(s, done(4))
    expect(s.streak).toBe(2)
    expect(currentStreak(s, 5)).toBe(2) // today not played yet: streak still alive
    expect(currentStreak(s, 6)).toBe(0) // skipped day 5
    s = completeDay(s, done(6))
    expect(s.streak).toBe(1)
    expect(s.bestStreak).toBe(2)
    expect(completeDay(s, done(6)).streak).toBe(1) // completing twice doesn't double count
  })
})
