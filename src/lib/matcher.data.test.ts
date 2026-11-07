/**
 * Integration tests against the real generated data (public/data/*.json).
 * Run `npm run data` first if these files are missing.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TIERS } from '../config/tiers'
import { buildNameIndex, createMatcher, normalize, type MatchResult, type PromptData } from './matcher'

interface PromptsFile {
  rangeStart: number
  prompts: (PromptData & { text: string; qualifier: string; category: string })[]
}
const data: PromptsFile = JSON.parse(readFileSync('public/data/prompts.json', 'utf8'))
const known = buildNameIndex(JSON.parse(readFileSync('public/data/names.json', 'utf8')).names)
const byId = new Map(data.prompts.map((p) => [p.id, p]))
const matcher = (id: string) => {
  const p = byId.get(id)
  if (!p) throw new Error(`missing prompt ${id}`)
  return createMatcher(p, known)
}
const name = (r: MatchResult) => (r.kind === 'correct' ? r.answer.name : r.kind)

describe('prompts.json shape', () => {
  it('has at least 60 prompts, each with >= 15 answers spread over all tiers', () => {
    expect(data.prompts.length).toBeGreaterThanOrEqual(60)
    for (const p of data.prompts) {
      expect(p.answers.length, p.id).toBeGreaterThanOrEqual(15)
      const tiers = new Set(p.answers.map((a) => a.tier))
      for (const t of TIERS) expect(tiers.has(t.tier), `${p.id} tier ${t.tier}`).toBe(true)
    }
  })

  it('lists answers most famous first (tiers never decrease)', () => {
    for (const p of data.prompts) {
      const tiers = p.answers.map((a) => a.tier)
      expect([...tiers].sort((x, y) => x - y), p.id).toEqual(tiers)
    }
  })

  it('never lists a player as both valid and out of range', () => {
    for (const p of data.prompts) {
      const ids = new Set(p.answers.map((a) => a.playerId))
      for (const o of p.outOfRange) expect(ids.has(o.playerId), `${p.id} ${o.name}`).toBe(false)
    }
  })

  it('has unique ids and every answer has a non-empty name', () => {
    expect(new Set(data.prompts.map((p) => p.id)).size).toBe(data.prompts.length)
    for (const p of data.prompts) for (const a of p.answers) expect(normalize(a.name).length).toBeGreaterThan(0)
  })
})

describe('real prompts', () => {
  it('Giants WR: nickname, typo, last name', () => {
    const m = matcher('team-nyg-wr')
    expect(name(m.match('OBJ'))).toBe('Odell Beckham Jr.')
    expect(name(m.match('odell beckam'))).toBe('Odell Beckham Jr.')
    expect(name(m.match('Toomer'))).toBe('Amani Toomer')
    expect(name(m.match('Plaxico'))).toBe('wrong') // first name alone is not accepted
    expect(name(m.match('Plaxico Buress'))).toBe('Plaxico Burress')
    expect(m.match('Jerry Rice').kind).toBe('wrong')
  })

  it('Giants QB: rejects a typo closer to a non-answer', () => {
    const m = matcher('team-nyg-qb')
    expect(name(m.match('Eli Manning'))).toBe('Eli Manning')
    expect(name(m.match('Simms'))).toBe('Phil Simms')
    // Peyton was never a Giant; "Payton Manning" is 1 edit from Peyton, far from Eli
    expect(m.match('Payton Manning').kind).toBe('wrong')
    expect(m.match('Peyton Manning').kind).toBe('wrong')
  })

  it('Chiefs prompts: Pat Mahomes via first-name variants', () => {
    const m = matcher('team-kc-te')
    expect(name(m.match('Kelce'))).toBe('Travis Kelce')
    const sb = matcher('award-sb-mvp')
    expect(name(sb.match('Pat Mahomes'))).toBe('Patrick Mahomes')
    expect(name(sb.match('mahomes'))).toBe('Patrick Mahomes')
  })

  it('Super Bowl MVP: pre-1980 winners are out of range, not wrong', () => {
    const m = matcher('award-sb-mvp')
    expect(m.match('Joe Namath')).toMatchObject({ kind: 'outOfRange' })
    expect(m.match('Terry Bradshaw')).toMatchObject({ kind: 'outOfRange' })
    expect(name(m.match('Joe Montana'))).toBe('Joe Montana')
    expect(name(m.match('Kenneth Walker'))).toBe('Kenneth Walker III')
    expect(m.match('Dan Marino').kind).toBe('wrong')
  })

  it('Jets QB: Namath is before our time', () => {
    expect(matcher('team-nyj-qb').match('Namath')).toMatchObject({ kind: 'outOfRange' })
  })

  it('Steelers LB: T.J. vs TJ', () => {
    const m = matcher('team-pit-lb')
    expect(name(m.match('TJ Watt'))).toBe('T.J. Watt')
    expect(name(m.match('t.j. watt'))).toBe('T.J. Watt')
  })

  it('DPOY: Patrick Surtain II is matched despite nflverse dropping the suffix', () => {
    const m = matcher('award-dpoy')
    expect(name(m.match('Patrick Surtain II'))).toMatch(/Surtain/)
    expect(name(m.match('Pat Surtain'))).toMatch(/Surtain/)
  })

  it('Panthers / 49ers RB: CMC', () => {
    expect(name(matcher('team-sf-rb').match('CMC'))).toBe('Christian McCaffrey')
  })

  it('ambiguous last names ask for more', () => {
    expect(matcher('team-nyg-wr').match('Smith').kind).toBe('ambiguous')
  })
})
