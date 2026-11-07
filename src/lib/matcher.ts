/**
 * Client-side answer matching for a single prompt.
 *
 * Rules (see SPEC.md "Name matching"):
 *  - case / punctuation / diacritic insensitive; ignores Jr. Sr. II III IV V
 *  - aliases and nicknames (shipped per answer in prompts.json)
 *  - small typos accepted, but never when the guess is at least as close to a different
 *    player (an out-of-range player, or any known NFL player from names.json)
 *  - last name alone accepted only when exactly one answer in the prompt has that last name
 */

export interface PlayerRef {
  playerId: string
  name: string
  aliases: string[]
  lastName: string
}

export interface Answer extends PlayerRef {
  tier: number
}

export interface PromptData {
  id: string
  /** Sorted most famous first (the pipeline guarantees this). */
  answers: Answer[]
  outOfRange: PlayerRef[]
}

export type MatchResult =
  | { kind: 'correct'; answer: Answer; via: 'name' | 'alias' | 'lastName' | 'typo' }
  | { kind: 'outOfRange'; player: PlayerRef }
  | { kind: 'ambiguous'; candidates: Answer[] }
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

/** Every known NFL player name (public/data/names.json). */
export interface NameIndex {
  keys: Set<string>
  lastKeys: Set<string>
  byLength: Map<number, string[]>
}

export function buildNameIndex(names: string[]): NameIndex {
  const keys = new Set<string>()
  const lastKeys = new Set<string>()
  const byLength = new Map<number, string[]>()
  for (const n of names) {
    const t = tokens(n)
    const k = t.join('')
    if (!k) continue
    if (t.length > 1) lastKeys.add(t[t.length - 1])
    if (keys.has(k)) continue
    keys.add(k)
    const list = byLength.get(k.length)
    if (list) list.push(k)
    else byLength.set(k.length, [k])
  }
  return { keys, lastKeys, byLength }
}

function knownWithin(known: NameIndex, q: string, d: number, exclude: Set<string>): boolean {
  for (let len = q.length - d; len <= q.length + d; len++) {
    for (const k of known.byLength.get(len) ?? []) {
      if (!exclude.has(k) && editDistance(q, k, d) <= d) return true
    }
  }
  return false
}

// --------------------------------------------------------------------------- matcher

interface Entry<T extends PlayerRef> {
  player: T
  nameKey: string
  aliasKeys: Set<string>
  keys: Set<string>
  last: string
}

function entry<T extends PlayerRef>(p: T): Entry<T> {
  const nameKey = normalize(p.name)
  const aliasKeys = new Set(p.aliases.map(normalize).filter((k) => k && k !== nameKey))
  return { player: p, nameKey, aliasKeys, keys: new Set([nameKey, ...aliasKeys]), last: normalize(p.lastName) }
}

export interface PromptMatcher {
  match(guess: string): MatchResult
}

export function createMatcher(prompt: PromptData, known?: NameIndex): PromptMatcher {
  const answers = prompt.answers.map(entry)
  const outOfRange = prompt.outOfRange.map(entry)
  const promptKeys = new Set([...answers, ...outOfRange].flatMap((e) => [...e.keys]))

  /**
   * Closest player within `limit` edits, comparing `q` against `keysOf(entry)`. Accepted only
   * if every player at the best distance is an answer with the same name (namesakes resolve
   * to the most famous), and no out-of-range or other known player is as close.
   */
  function fuzzy(q: string, limit: number, keysOf: (e: Entry<PlayerRef>) => Iterable<string>, checkKnown: boolean): MatchResult | null {
    let best = limit + 1
    let hitAnswers: Entry<Answer>[] = []
    let hitOut: Entry<PlayerRef>[] = []
    const visit = (e: Entry<PlayerRef>, isAnswer: boolean) => {
      let d = limit + 1
      for (const k of keysOf(e)) d = Math.min(d, editDistance(q, k, limit))
      if (d > limit || d > best) return
      if (d < best) {
        best = d
        hitAnswers = []
        hitOut = []
      }
      if (isAnswer) hitAnswers.push(e as Entry<Answer>)
      else hitOut.push(e)
    }
    answers.forEach((e) => visit(e, true))
    outOfRange.forEach((e) => visit(e, false))
    if (best > limit) return null
    if (hitAnswers.length > 0 && hitOut.length > 0) return null // as close to a non-answer
    if (checkKnown && known && knownWithin(known, q, best, promptKeys)) return null

    if (hitAnswers.length > 0) {
      const names = new Set(hitAnswers.map((e) => e.nameKey))
      if (names.size > 1) return { kind: 'ambiguous', candidates: hitAnswers.map((e) => e.player) }
      return { kind: 'correct', answer: hitAnswers[0].player, via: 'typo' }
    }
    const names = new Set(hitOut.map((e) => e.nameKey))
    return names.size === 1 ? { kind: 'outOfRange', player: hitOut[0].player } : null
  }

  function match(guess: string): MatchResult {
    const t = tokens(guess)
    const q = t.join('')
    if (q.length < 2) return { kind: 'wrong' }

    // 1. exact name or alias of an answer (first = most famous among namesakes)
    const exact = answers.find((e) => e.keys.has(q))
    if (exact) return { kind: 'correct', answer: exact.player, via: exact.nameKey === q ? 'name' : 'alias' }

    // 2. exact name of an out-of-range player ("before our time")
    const oor = outOfRange.find((e) => e.keys.has(q))
    if (oor) return { kind: 'outOfRange', player: oor.player }

    // 3. exact name of some other real player: a real but wrong answer, never typo-corrected
    if (known?.keys.has(q)) return { kind: 'wrong' }

    // 4. last name only, unambiguous within this prompt's answers
    const byLast = answers.filter((e) => e.last === q)
    if (new Set(byLast.map((e) => e.player.playerId)).size === 1) {
      return { kind: 'correct', answer: byLast[0].player, via: 'lastName' }
    }
    if (byLast.length > 1) return { kind: 'ambiguous', candidates: byLast.map((e) => e.player) }
    const oorLast = outOfRange.filter((e) => e.last === q)
    if (oorLast.length === 1) return { kind: 'outOfRange', player: oorLast[0].player }

    const limit = maxEdits(q.length)
    if (limit === 0) return { kind: 'wrong' }

    // 5. typo on a full name or alias
    const full = fuzzy(q, limit, (e) => e.keys, true)
    if (full) return full

    // 6. typo on a last name: single-word guesses that are not themselves a real last name
    if (t.length === 1 && !known?.lastKeys.has(q)) {
      const last = fuzzy(q, limit, (e) => [e.last], false)
      if (last) return last
    }
    return { kind: 'wrong' }
  }

  return { match }
}
