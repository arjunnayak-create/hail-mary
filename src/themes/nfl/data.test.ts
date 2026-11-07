/**
 * Integration tests against the real generated data (public/data/*.json).
 * Run `npm run data` first if these files are missing.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import tiersJson from './tiers.json'
import { buildNameIndex, createMatcher, normalize, type MatchResult, type PromptData } from '../../engine/matcher'

interface PromptsFile {
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
      for (const t of tiersJson.tiers) expect(tiers.has(t.tier), `${p.id} tier ${t.tier}`).toBe(true)
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
      const ids = new Set(p.answers.map((a) => a.id))
      for (const o of p.outOfRange) expect(ids.has(o.id), `${p.id} ${o.name}`).toBe(false)
    }
  })

  it('has unique ids and every answer has a non-empty name', () => {
    expect(new Set(data.prompts.map((p) => p.id)).size).toBe(data.prompts.length)
    for (const p of data.prompts) for (const a of p.answers) expect(normalize(a.name).length).toBeGreaterThan(0)
  })
})

const sug = (r: MatchResult) => (r.kind === 'suggest' ? r.suggestions : [])

describe('real prompts', () => {
  it('Giants WR: nickname accepted, typo and surname become suggestions', () => {
    const m = matcher('team-nyg-wr')
    expect(name(m.match('OBJ'))).toBe('Odell Beckham Jr.')
    expect(sug(m.match('odell beckam'))).toEqual(['Odell Beckham Jr.'])
    expect(sug(m.match('Plaxico Buress'))).toEqual(['Plaxico Burress'])
    expect(sug(m.match('Toomer'))).toContain('Amani Toomer')
    expect(m.match('Jerry Rice').kind).toBe('wrong')
  })

  it('Giants QB: a typo of a non-answer suggests that non-answer, which then misses', () => {
    const m = matcher('team-nyg-qb')
    expect(name(m.match('Eli Manning'))).toBe('Eli Manning')
    expect(sug(m.match('Manning'))[0]).toBe('Peyton Manning') // global fame order
    expect(sug(m.match('Manning'))).toContain('Eli Manning')
    expect(m.match('Peyton Manning').kind).toBe('wrong')
  })

  it('surname suggestions come from the full list, capped at 3', () => {
    const r = sug(matcher('team-nyg-wr').match('Smith'))
    expect(r).toHaveLength(3)
    // the most famous Smiths in the league, not "the Smiths who were Giants WRs"
    expect(r.slice(0, 2).sort()).toEqual(['Bruce Smith', 'Emmitt Smith'])
  })

  it('Super Bowl MVP: Pat Mahomes alias, pre-1980 winners out of range', () => {
    const sb = matcher('award-sb-mvp')
    expect(name(sb.match('Pat Mahomes'))).toBe('Patrick Mahomes')
    expect(sb.match('Joe Namath')).toMatchObject({ kind: 'outOfRange' })
    expect(sb.match('Terry Bradshaw')).toMatchObject({ kind: 'outOfRange' })
    expect(name(sb.match('Kenneth Walker'))).toBe('Kenneth Walker III')
    expect(sb.match('Dan Marino').kind).toBe('wrong')
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

  it('49ers RB: CMC', () => {
    expect(name(matcher('team-sf-rb').match('CMC'))).toBe('Christian McCaffrey')
  })
})
