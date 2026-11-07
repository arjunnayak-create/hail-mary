/**
 * Client-side answer matching for a single prompt.
 *
 *  - Exact name or known alias of an answer: accepted immediately.
 *  - Exact name of an out-of-range entry: "before our time".
 *  - Exact name of any other known entry (names.json): wrong.
 *  - A bare surname (no chips): exactly one answer with it -> accepted; several -> ambiguous
 *    ("add a first name"); none, but an out-of-range entry -> "before our time"; else wrong.
 *  - Typo on a full name: one "Did you mean …?" suggestion, ONLY from this prompt's entries
 *    (valid answers + out-of-range), within a forgiving edit budget. Nothing close -> wrong.
 *  - Case / punctuation / diacritic insensitive; ignores Jr. Sr. II III IV V.
 * A suggestion is only a name: the UI submits it again, and it is then judged exactly.
 */
import type { Answer, AnswerRef, PromptData } from './types'

export type { Answer, AnswerRef, PromptData }

export type MatchResult =
  | { kind: 'correct'; answer: Answer; via: 'name' | 'alias' | 'shortName' }
  | { kind: 'outOfRange'; entry: AnswerRef }
  /** A typo: ask "Did you mean …?" before accepting. */
  | { kind: 'suggest'; suggestions: string[]; reason: 'typo' }
  /** A surname shared by several answers: ask for a first name. */
  | { kind: 'ambiguous'; count: number }
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
 * Edit budget for suggestions (looser than maxEdits): about a quarter of the guess, so
 * near-misses like "Christin McCafery" still find Christian McCaffrey.
 */
export function suggestEdits(len: number): number {
  if (len <= 4) return 1
  return Math.min(4, Math.ceil(len / 4))
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

/** Every known name in the domain (public/data/names.json): exact non-answers are wrong. */
export interface NameIndex {
  keys: Set<string>
}

export function buildNameIndex(names: string[]): NameIndex {
  const keys = new Set<string>()
  for (const n of names) {
    const k = normalize(n)
    if (k) keys.add(k)
  }
  return { keys }
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
  // answers are most famous first; out-of-range entries follow
  const entries: Entry<AnswerRef>[] = [...answers, ...outOfRange]

  const uniqueNames = (list: Entry<AnswerRef>[], max: number) => {
    const out: string[] = []
    for (const e of list) if (!out.includes(e.ref.name) && out.length < max) out.push(e.ref.name)
    return out
  }

  /** Entries at the smallest distance (within limit) by `keysOf`, in fame order. */
  function closest(q: string, limit: number, keysOf: (e: Entry<AnswerRef>) => Iterable<string>) {
    let best = limit + 1
    let hits: Entry<AnswerRef>[] = []
    for (const e of entries) {
      let d = limit + 1
      for (const k of keysOf(e)) if (k) d = Math.min(d, editDistance(q, k, limit))
      if (d < best) {
        best = d
        hits = [e]
      } else if (d === best && d <= limit) hits.push(e)
    }
    return hits
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

    // 4. a bare surname (one word, or exactly a multi-word surname like "St. Brown"):
    //    accept if exactly one answer has it, never show chips
    if (t.length === 1 || entries.some((e) => e.last === q)) {
      const ids = new Set(answers.filter((e) => e.last === q).map((e) => e.ref.id))
      if (ids.size === 1) return { kind: 'correct', answer: answers.find((e) => e.last === q)!.ref, via: 'shortName' }
      if (ids.size > 1) return { kind: 'ambiguous', count: ids.size }
      const oorHit = outOfRange.find((e) => e.last === q)
      if (oorHit) return { kind: 'outOfRange', entry: oorHit.ref }
      return { kind: 'wrong' }
    }

    // 5. typo on a full name: the closest entry in this prompt, if any is near enough
    const hits = closest(q, suggestEdits(q.length), (e) => e.keys)
    return hits.length ? { kind: 'suggest', suggestions: uniqueNames(hits, 1), reason: 'typo' } : { kind: 'wrong' }
  }

  return { match }
}
