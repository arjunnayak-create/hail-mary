import { describe, expect, it } from 'vitest'
import {
  buildNameIndex,
  createMatcher,
  editDistance,
  maxEdits,
  suggestEdits,
  normalize,
  type Answer,
  type MatchResult,
  type AnswerRef,
  type PromptData,
} from './matcher'

function a(name: string, tier: number, extra: Partial<Answer> = {}): Answer {
  const last = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' ').slice(-1)[0]
  return { id: name.toLowerCase().replace(/\W+/g, '-'), name, aliases: [], shortName: last, tier, ...extra }
}
function ref(name: string): AnswerRef {
  const { id, aliases, shortName } = a(name, 0)
  return { id, name, aliases, shortName }
}
const answerName = (r: MatchResult) => (r.kind === 'correct' ? r.answer.name : null)

// A made-up prompt that exercises every rule.
const prompt: PromptData = {
  id: 'test',
  answers: [
    a('Odell Beckham Jr.', 1, { aliases: ['OBJ'] }),
    a('Patrick Mahomes', 1, { aliases: ['Pat Mahomes'] }),
    a('Christian McCaffrey', 1, { aliases: ['CMC'] }),
    a('T.J. Watt', 2, { shortName: 'Watt' }),
    a('Amon-Ra St. Brown', 2, { shortName: 'St. Brown' }),
    a("Ja'Marr Chase", 2),
    a('Kenneth Walker III', 3, { shortName: 'Walker' }),
    a('Mike Williams', 3, { id: 'mike-williams-1' }),
    a('Mike Williams', 5, { id: 'mike-williams-2' }),
    a('Roy Williams', 4),
    a('Brandon Marshall', 4),
    a('Kaʻimi Fairbairn', 5),
  ],
  outOfRange: [ref('Joe Namath'), ref('Lynn Swann')],
}
// names.json is ordered most famous first
const known = buildNameIndex([
  'Peyton Manning',
  'Tom Brady',
  'Eli Manning',
  ...prompt.answers.map((x) => x.name),
  'Joe Namath',
  'Lynn Swann',
  'Archie Manning',
  'Brandon Marshal', // a (fictional) different player one edit from an answer
  'Watt Jones',
  'Danieal Manning',
])
const m = createMatcher(prompt, known)
const suggested = (r: MatchResult) => (r.kind === 'suggest' ? r.suggestions : null)

describe('normalize', () => {
  it('is case, punctuation and diacritic insensitive', () => {
    expect(normalize('  T.J. WATT ')).toBe('tjwatt')
    expect(normalize('TJ Watt')).toBe('tjwatt')
    expect(normalize('t j watt')).toBe('tjwatt')
    expect(normalize("Ja'Marr Chase")).toBe('jamarrchase')
    expect(normalize('Amon-Ra St. Brown')).toBe(normalize('amonra st brown'))
    expect(normalize('Kaʻimi Fairbairn')).toBe('kaimifairbairn')
    expect(normalize('José Cortéz')).toBe('josecortez')
  })

  it('ignores Jr. / Sr. / II / III / IV / V', () => {
    expect(normalize('Odell Beckham Jr.')).toBe('odellbeckham')
    expect(normalize('Odell Beckham Jr')).toBe('odellbeckham')
    expect(normalize('Kenneth Walker III')).toBe('kennethwalker')
    expect(normalize('Patrick Surtain II')).toBe('patricksurtain')
    expect(normalize('Steve Smith Sr.')).toBe('stevesmith')
  })
})

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and transpositions', () => {
    expect(editDistance('mahomes', 'mahomes')).toBe(0)
    expect(editDistance('mahomes', 'mahomse')).toBe(1) // transposition
    expect(editDistance('beckham', 'beckam')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
  it('stops early past the limit', () => {
    expect(editDistance('abcdefgh', 'zzzzzzzz', 2)).toBe(3)
  })
  it('scales allowed edits with length', () => {
    expect(maxEdits(4)).toBe(0)
    expect(maxEdits(7)).toBe(1)
    expect(maxEdits(12)).toBe(2)
  })
})

describe('exact names and aliases', () => {
  it('accepts canonical names in any case / punctuation', () => {
    expect(m.match('odell beckham')).toMatchObject({ kind: 'correct', via: 'name' })
    expect(answerName(m.match('ODELL BECKHAM JR.'))).toBe('Odell Beckham Jr.')
    expect(answerName(m.match('TJ Watt'))).toBe('T.J. Watt')
    expect(answerName(m.match('T. J. Watt'))).toBe('T.J. Watt')
    expect(answerName(m.match('jamarr chase'))).toBe("Ja'Marr Chase")
    expect(answerName(m.match('Kenneth Walker'))).toBe('Kenneth Walker III')
    expect(answerName(m.match('kaimi fairbairn'))).toBe('Kaʻimi Fairbairn')
  })

  it('accepts nicknames and aliases', () => {
    expect(m.match('OBJ')).toMatchObject({ kind: 'correct', via: 'alias', answer: { name: 'Odell Beckham Jr.' } })
    expect(m.match('obj')).toMatchObject({ kind: 'correct', via: 'alias' })
    expect(answerName(m.match('CMC'))).toBe('Christian McCaffrey')
    expect(answerName(m.match('Pat Mahomes'))).toBe('Patrick Mahomes')
  })

  it('resolves namesakes to the most famous (first-listed) one', () => {
    const r = m.match('Mike Williams')
    expect(r).toMatchObject({ kind: 'correct', answer: { id: 'mike-williams-1' } })
  })
})

const promptNames = new Set([...prompt.answers, ...prompt.outOfRange].map((x) => x.name))

describe('surname only: no chips', () => {
  it('accepts directly when exactly one answer has that surname', () => {
    expect(m.match('Mahomes')).toMatchObject({ kind: 'correct', via: 'shortName', answer: { name: 'Patrick Mahomes' } })
    expect(answerName(m.match('Watt'))).toBe('T.J. Watt')
    expect(answerName(m.match('St Brown'))).toBe('Amon-Ra St. Brown')
    expect(answerName(m.match('Walker'))).toBe('Kenneth Walker III')
  })

  it('asks for a first name when several answers share it', () => {
    // two Mike Williamses + Roy Williams
    expect(m.match('Williams')).toEqual({ kind: 'ambiguous', count: 3 })
  })

  it('out-of-range surname -> before our time', () => {
    expect(m.match('Namath')).toMatchObject({ kind: 'outOfRange', entry: { name: 'Joe Namath' } })
  })

  it('a surname outside the prompt is a wrong guess, never a suggestion', () => {
    expect(m.match('Manning')).toEqual({ kind: 'wrong' })
    expect(m.match('Brady')).toEqual({ kind: 'wrong' })
    expect(m.match('Mahomse')).toEqual({ kind: 'wrong' }) // surname typos aren't corrected
  })
})

describe('typos on full names: one suggestion from this prompt', () => {
  it('suggests the closest prompt entry', () => {
    expect(m.match('Odell Beckam')).toEqual({ kind: 'suggest', suggestions: ['Odell Beckham Jr.'], reason: 'typo' })
    expect(suggested(m.match('Patrik Mahomes'))).toEqual(['Patrick Mahomes'])
    expect(suggested(m.match('Christain McCaffery'))).toEqual(['Christian McCaffrey'])
  })

  it('has a looser budget than strict matching (about a quarter of the guess)', () => {
    expect([4, 5, 8, 9, 12, 13, 20].map(suggestEdits)).toEqual([1, 2, 2, 3, 3, 4, 4])
    expect(suggestEdits(16)).toBeGreaterThan(maxEdits(16))
  })

  it('finds near-misses', () => {
    expect(editDistance('christinmcafery', 'christianmccaffrey')).toBe(4)
    expect(suggested(m.match('Christin McAfery'))).toEqual(['Christian McCaffrey'])
    expect(suggested(m.match('Amon Ra St Brwn'))).toEqual(['Amon-Ra St. Brown'])
    expect(suggested(m.match('Kaimi Fairbarn'))).toEqual(['Kaʻimi Fairbairn'])
  })

  it('suggests out-of-range entries too (they resolve to "before our time" on confirm)', () => {
    expect(suggested(m.match('Joe Namoth'))).toEqual(['Joe Namath'])
  })

  it('no chips when nothing in the prompt is close, even if a known player is', () => {
    expect(m.match('Payton Manning')).toEqual({ kind: 'wrong' })
    expect(m.match('Tom Bradie')).toEqual({ kind: 'wrong' })
    expect(m.match('asdfghjkl qwerty')).toEqual({ kind: 'wrong' })
  })

  it('every suggestion is a prompt entry', () => {
    for (const g of ['Odell Beckam', 'Joe Namoth', 'Brandon Marshel', 'Jamar Chase', 'Mike Wiliams', 'Ken Walkr']) {
      for (const n of suggested(m.match(g)) ?? []) expect(promptNames.has(n), `${g} -> ${n}`).toBe(true)
    }
  })

  it('a confirmed suggestion is then judged exactly', () => {
    expect(answerName(m.match('Odell Beckham Jr.'))).toBe('Odell Beckham Jr.')
    expect(m.match('Joe Namath').kind).toBe('outOfRange')
  })

  it('a known non-answer typed exactly is wrong, never "corrected"', () => {
    expect(m.match('Brandon Marshal').kind).toBe('wrong')
    expect(m.match('Peyton Manning').kind).toBe('wrong')
  })

  it('short junk is wrong', () => {
    expect(m.match('Wat').kind).toBe('wrong')
    expect(m.match('x').kind).toBe('wrong')
  })
})

describe('out of range and wrong answers', () => {
  it('reports pre-range players as out of range, not wrong', () => {
    expect(m.match('Joe Namath')).toMatchObject({ kind: 'outOfRange' })
    expect(m.match('lynn swann')).toMatchObject({ kind: 'outOfRange' })
  })
  it('rejects junk', () => {
    expect(m.match('').kind).toBe('wrong')
    expect(m.match('   ').kind).toBe('wrong')
    expect(m.match('x').kind).toBe('wrong')
    expect(m.match('asdfghjkl').kind).toBe('wrong')
  })
  it('works without a known-names index', () => {
    const bare = createMatcher(prompt)
    expect(suggested(bare.match('Odell Beckam'))).toEqual(['Odell Beckham Jr.'])
    expect(bare.match('Tom Brady').kind).toBe('wrong')
  })
})
