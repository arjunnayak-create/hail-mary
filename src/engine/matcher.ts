/**
 * Client-side answer matching for a single prompt (confirm-before-throw).
 *
 *  - Exact name or known alias of an answer: accepted immediately.
 *  - Exact name of an out-of-range entry: "before our time".
 *  - Exact name of any other known entry: wrong (never "corrected").
 *  - Typo on a full name: one suggestion to confirm, from THIS prompt's answers first (with a
 *    forgiving edit limit), else the closest known name (names.json).
 *  - A bare surname: up to 3 suggestions from the FULL known-name list, most famous first,
 *    so a surname alone never reveals which entries are valid answers.
 *  - Case / punctuation / diacritic insensitive; ignores Jr. Sr. II III IV V.
 * A suggestion is only a name: the UI submits it again, and it is then judged exactly.
 */
import type { Answer, AnswerRef, PromptData } from './types'

export type { Answer, AnswerRef, PromptData }

export type MatchResult =
  | { kind: 'correct'; answer: Answer; via: 'name' | 'alias' }
  | { kind: 'outOfRange'; entry: AnswerRef }
  /** Not accepted yet: ask "Did you mean …?" with these names (most likely first). */
  | { kind: 'suggest'; suggestions: string[]; reason: 'typo' | 'shortName' }
  | { kind: 'wrong' }

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Lowercase ascii tokens with punctuation removed and generational suffixes dropped. */
export function tokens(raw: string): string[] {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/['‘’ʻ`]/g, '') // apostrophes: Ja'Marr -> jamarr
    .replace(/[^a-z0-9]+/g, ' ') // anything else (. - ,) separates tokens
    .trim()
  if (!s) return []
  return s.split(' ').filter((t, i) => i === 0 || !SUFFIXES.has(t))
}

/**
 * Compact comparison key: tokens joined without spaces, so "T.J. Watt", "TJ Watt" and
 * "t j watt" are identical, as are "Amon-Ra St. Brown" and "amonra st brown".
 */
export function normalize(raw: string): string {
  return tokens(raw).join('')
}

/** Max typo edits allowed for a guess of this compact length. */
export function maxEdits(len: number): number {
  if (len <= 4) return 0
  if (len <= 8) return 1
  return 2
}

/**
 * Optimal string alignment distance (Levenshtein + adjacent transpositions). Returns
 * `limit + 1` as soon as the distance is known to exceed `limit`.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  const m = b.length
  let prev2 = new Array<number>(m + 1).fill(0)
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  let cur = new Array<number>(m + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > limit) return limit + 1
    ;[prev2, prev, cur] = [prev, cur, prev2]
  }
  return prev[m]
}

// --------------------------------------------------------------------------- known names

/** Every known name in the domain (public/data/names.json), most famous first. */
export interface NameIndex {
  keys: Set<string>
  /** Display names by length of their compact key (for typo search). */
  byLength: Map<number, { key: string; name: string; rank: number }[]>
  /** Display names by surname key, most famous first. */
  bySurname: Map<string, string[]>
}

export function buildNameIndex(names: string[]): NameIndex {
  const keys = new Set<string>()
  const byLength: NameIndex['byLength'] = new Map()
  const bySurname: NameIndex['bySurname'] = new Map()
  names.forEach((n, rank) => {
    const t = tokens(n)
    const k = t.join('')
    if (!k || keys.has(k)) return
    keys.add(k)
    const list = byLength.get(k.length)
    if (list) list.push({ key: k, name: n, rank })
    else byLength.set(k.length, [{ key: k, name: n, rank }])
    if (t.length > 1) {
      const last = t[t.length - 1]
      const s = bySurname.get(last)
      if (s) s.push(n)
      else bySurname.set(last, [n])
    }
  })
  return { keys, byLength, bySurname }
}

/** Closest known names within `limit` edits (ties: most famous first). */
function closestKnown(known: NameIndex, q: string, limit: number, max: number): string[] {
  let best = limit + 1
  let hits: { name: string; rank: number }[] = []
  for (let len = q.length - limit; len <= q.length + limit; len++) {
    for (const e of known.byLength.get(len) ?? []) {
      const d = editDistance(q, e.key, Math.min(limit, best))
      if (d < best) {
        best = d
        hits = [e]
      } else if (d === best && d <= limit) hits.push(e)
    }
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, max).map((h) => h.name)
}

// --------------------------------------------------------------------------- matcher

interface Entry<T extends AnswerRef> {
  ref: T
  nameKey: string
  aliasKeys: Set<string>
  keys: Set<string>
  last: string
}

function entry<T extends AnswerRef>(p: T): Entry<T> {
  const nameKey = normalize(p.name)
  const aliasKeys = new Set(p.aliases.map(normalize).filter((k) => k && k !== nameKey))
  return { ref: p, nameKey, aliasKeys, keys: new Set([nameKey, ...aliasKeys]), last: normalize(p.shortName ?? '') }
}

export interface PromptMatcher {
  match(guess: string): MatchResult
}

export function createMatcher(prompt: PromptData, known?: NameIndex): PromptMatcher {
  const answers = prompt.answers.map(entry)
  const outOfRange = prompt.outOfRange.map(entry)
  const surnames = new Map<string, string[]>() // fallback when there is no known-name list
  for (const e of [...answers, ...outOfRange]) {
    if (!e.last) continue
    const l = surnames.get(e.last) ?? []
    if (!l.includes(e.ref.name)) l.push(e.ref.name)
    surnames.set(e.last, l)
  }

  /** Closest answer (or out-of-range entry) within a forgiving limit; most famous on ties. */
  function closestInPrompt(q: string, limit: number): string | null {
    let best = limit + 1
    let name: string | null = null
    for (const e of [...answers, ...outOfRange]) {
      let d = limit + 1
      for (const k of e.keys) d = Math.min(d, editDistance(q, k, limit))
      if (d < best) {
        best = d
        name = e.ref.name
      }
    }
    return name
  }

  function match(guess: string): MatchResult {
    const t = tokens(guess)
    const q = t.join('')
    if (q.length < 2) return { kind: 'wrong' }

    // 1. exact name or alias of an answer (first = most famous among namesakes)
    const exact = answers.find((e) => e.keys.has(q))
    if (exact) return { kind: 'correct', answer: exact.ref, via: exact.nameKey === q ? 'name' : 'alias' }

    // 2. exact name of an out-of-range entry ("before our time")
    const oor = outOfRange.find((e) => e.keys.has(q))
    if (oor) return { kind: 'outOfRange', entry: oor.ref }

    // 3. exact name of some other real entry: a real but wrong answer
    if (known?.keys.has(q)) return { kind: 'wrong' }

    // 4. a bare surname: suggest from the full name list (most famous first), never from
    //    this prompt's answers, so a surname alone doesn't reveal what's valid
    if (t.length === 1) {
      const pool = known?.bySurname ?? surnames
      let names = pool.get(q) ?? []
      if (!names.length) {
        const limit = maxEdits(q.length)
        if (limit > 0) {
          let best = limit + 1
          for (const [last, list] of pool) {
            if (Math.abs(last.length - q.length) > limit) continue
            const d = editDistance(q, last, limit)
            if (d < best) {
              best = d
              names = [...list]
            } else if (d === best && d <= limit) names = names.concat(list)
          }
        }
      }
      return names.length ? { kind: 'suggest', suggestions: names.slice(0, 3), reason: 'shortName' } : { kind: 'wrong' }
    }

    // 5. typo on a full name: closest in this prompt (forgiving), else closest known name
    const inPrompt = closestInPrompt(q, maxEdits(q.length) + 1)
    if (inPrompt) return { kind: 'suggest', suggestions: [inPrompt], reason: 'typo' }
    const limit = maxEdits(q.length)
    if (known && limit > 0) {
      const names = closestKnown(known, q, limit, 1)
      if (names.length) return { kind: 'suggest', suggestions: names, reason: 'typo' }
    }
    return { kind: 'wrong' }
  }

  return { match }
}
