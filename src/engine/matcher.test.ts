import { describe, expect, it } from 'vitest'
import {
  buildNameIndex,
  createMatcher,
  editDistance,
  maxEdits,
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

describe('surname only: suggestions from the full name list, never auto-accepted', () => {
  it('suggests up to 3, most famous first, including non-answers', () => {
    expect(m.match('Manning')).toEqual({ kind: 'suggest', suggestions: ['Peyton Manning', 'Eli Manning', 'Archie Manning'], reason: 'shortName' })
  })

  it('a unique surname is still only a suggestion', () => {
    expect(m.match('Mahomes')).toEqual({ kind: 'suggest', suggestions: ['Patrick Mahomes'], reason: 'shortName' })
    expect(suggested(m.match('Watt'))).toEqual(['T.J. Watt'])
    expect(suggested(m.match('Walker'))).toEqual(['Kenneth Walker III'])
  })

  it('does not reveal answers: order is global fame, not prompt membership', () => {
    expect(suggested(m.match('Williams'))).toEqual(['Mike Williams', 'Roy Williams'])
  })

  it('tolerates a surname typo', () => {
    expect(suggested(m.match('Mahomse'))).toEqual(['Patrick Mahomes'])
  })

  it('out-of-range surnames are suggested like any other name', () => {
    expect(suggested(m.match('Namath'))).toEqual(['Joe Namath'])
  })

  it('falls back to the prompt when no known-name list is loaded', () => {
    expect(suggested(createMatcher(prompt).match('Mahomes'))).toEqual(['Patrick Mahomes'])
  })
})

describe('typos on full names: one suggestion to confirm', () => {
  it('suggests the closest answer from this prompt', () => {
    expect(m.match('Odell Beckam')).toEqual({ kind: 'suggest', suggestions: ['Odell Beckham Jr.'], reason: 'typo' })
    expect(suggested(m.match('Patrik Mahomes'))).toEqual(['Patrick Mahomes'])
    expect(suggested(m.match('Christain McCaffery'))).toEqual(['Christian McCaffrey'])
  })

  it('is forgiving inside the prompt (one edit more than the strict limit)', () => {
    expect(editDistance('christinmccafery', 'christianmccaffrey')).toBe(3)
    expect(suggested(m.match('Christin McCafery'))).toEqual(['Christian McCaffrey'])
  })

  it('prefers this prompt over a closer-looking known name', () => {
    // "Brandon Marshel" is 1 edit from the known non-answer and 2 from the answer
    expect(suggested(m.match('Brandon Marshel'))).toEqual(['Brandon Marshall'])
  })

  it('falls back to the full name list when nothing in the prompt is close', () => {
    expect(m.match('Payton Manning')).toEqual({ kind: 'suggest', suggestions: ['Peyton Manning'], reason: 'typo' })
    expect(suggested(m.match('Tom Bradie'))).toEqual(['Tom Brady'])
  })

  it('suggests out-of-range entries too (they resolve to "before our time" on confirm)', () => {
    expect(suggested(m.match('Joe Namoth'))).toEqual(['Joe Namath'])
  })

  it('a confirmed suggestion is then judged exactly', () => {
    expect(answerName(m.match('Odell Beckham Jr.'))).toBe('Odell Beckham Jr.')
    expect(m.match('Peyton Manning').kind).toBe('wrong')
    expect(m.match('Joe Namath').kind).toBe('outOfRange')
  })

  it('does not suggest for junk', () => {
    expect(m.match('asdfghjkl qwerty').kind).toBe('wrong')
    expect(m.match('Wat').kind).toBe('wrong')
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
