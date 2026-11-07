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
const entryNames = (id: string) => {
  const p = byId.get(id)!
  return new Set([...p.answers, ...p.outOfRange].map((a) => a.name))
}

describe('real prompts', () => {
  it('Giants WR: nickname accepted, typo suggests, surname rules', () => {
    const m = matcher('team-nyg-wr')
    expect(name(m.match('OBJ'))).toBe('Odell Beckham Jr.')
    expect(sug(m.match('odell beckam'))).toEqual(['Odell Beckham Jr.'])
    expect(sug(m.match('Plaxico Buress'))).toEqual(['Plaxico Burress'])
    expect(name(m.match('Toomer'))).toBe('Amani Toomer')
    expect(m.match('Smith').kind).toBe('ambiguous')
    expect(m.match('Jerry Rice').kind).toBe('wrong')
  })

  it('Giants QB: surname suggests only Giants QBs; non-answer typos get no chips', () => {
    const m = matcher('team-nyg-qb')
    expect(name(m.match('Eli Manning'))).toBe('Eli Manning')
    expect(name(m.match('Manning'))).toBe('Eli Manning')
    expect(name(m.match('Simms'))).toBe('Phil Simms')
    expect(m.match('Peyton Manning').kind).toBe('wrong')
    expect(m.match('Payton Manning').kind).toBe('wrong')
  })

  it('Jets QB: an out-of-range surname is "before our time"', () => {
    const m = matcher('team-nyj-qb')
    expect(m.match('Namath')).toMatchObject({ kind: 'outOfRange' })
    expect(m.match('Joe Namath')).toMatchObject({ kind: 'outOfRange' })
  })

  it('Super Bowl MVP: Pat Mahomes alias, pre-1980 winners out of range', () => {
    const sb = matcher('award-sb-mvp')
    expect(name(sb.match('Pat Mahomes'))).toBe('Patrick Mahomes')
    expect(sug(sb.match('Patrik Mahomse'))).toEqual(['Patrick Mahomes'])
    expect(sb.match('Terry Bradshaw')).toMatchObject({ kind: 'outOfRange' })
    expect(name(sb.match('Kenneth Walker'))).toBe('Kenneth Walker III')
    expect(sb.match('Dan Marino').kind).toBe('wrong')
  })

  it('every suggestion on every prompt is one of that prompt\'s entries', () => {
    for (const p of data.prompts.slice(0, 30)) {
      const m = createMatcher(p, known)
      const names = entryNames(p.id)
      for (const a of p.answers.slice(0, 5)) {
        for (const g of [a.name.slice(0, -1), a.name.slice(0, 1) + a.name.slice(2)]) {
          for (const n of sug(m.match(g))) expect(names.has(n), `${p.id}: ${g} -> ${n}`).toBe(true)
        }
      }
    }
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
