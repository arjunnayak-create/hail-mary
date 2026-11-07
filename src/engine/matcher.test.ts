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
const known = buildNameIndex([
  ...prompt.answers.map((x) => x.name),
  'Joe Namath',
  'Lynn Swann',
  'Peyton Manning',
  'Brandon Marshal', // a (fictional) different player one edit from an answer
  'Patrick Mahomes',
  'Tom Brady',
  'Watt Jones',
])
const m = createMatcher(prompt, known)

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

describe('last name only', () => {
  it('accepts a last name that is unique within the prompt', () => {
    expect(m.match('Mahomes')).toMatchObject({ kind: 'correct', via: 'shortName', answer: { name: 'Patrick Mahomes' } })
    expect(answerName(m.match('mccaffrey'))).toBe('Christian McCaffrey')
    expect(answerName(m.match('Watt'))).toBe('T.J. Watt')
    expect(answerName(m.match('St Brown'))).toBe('Amon-Ra St. Brown')
    expect(answerName(m.match('Walker'))).toBe('Kenneth Walker III')
  })

  it('rejects a last name shared by several answers as ambiguous', () => {
    const r = m.match('Williams')
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.name).sort()).toEqual(['Mike Williams', 'Mike Williams', 'Roy Williams'])
  })

  it('flags out-of-range players by last name', () => {
    expect(m.match('Namath')).toMatchObject({ kind: 'outOfRange', entry: { name: 'Joe Namath' } })
  })
})

describe('typos', () => {
  it('accepts small typos on full names', () => {
    expect(m.match('Odell Beckam')).toMatchObject({ kind: 'correct', via: 'typo', answer: { name: 'Odell Beckham Jr.' } })
    expect(answerName(m.match('Patrik Mahomes'))).toBe('Patrick Mahomes')
    expect(answerName(m.match('Christian McCafrey'))).toBe('Christian McCaffrey')
    expect(answerName(m.match('Christain McCaffery'))).toBe('Christian McCaffrey') // 2 edits on a long name
  })

  it('accepts small typos on unique last names', () => {
    expect(m.match('Mahomse')).toMatchObject({ kind: 'correct', via: 'typo', answer: { name: 'Patrick Mahomes' } })
  })

  it('does not fuzz short guesses', () => {
    expect(m.match('Wat').kind).toBe('wrong')
    expect(m.match('OBK').kind).toBe('wrong')
  })

  it('never accepts a typo that is at least as close to a different player', () => {
    // "Brandon Marshal" is exactly another (non-answer) player's name
    expect(m.match('Brandon Marshal').kind).toBe('wrong')
    // closer to the other player (1 edit) than to the answer (2 edits) -> rejected
    expect(m.match('Brandon Marshel').kind).toBe('wrong')
    // a tie (1 edit from both the answer and the other player) is also rejected
    expect(editDistance('brandonmarshael', 'brandonmarshall')).toBe(1)
    expect(editDistance('brandonmarshael', 'brandonmarshal')).toBe(1)
    expect(m.match('Brandon Marshael').kind).toBe('wrong')
    // ...but the same typo is fine when no other player is that close
    expect(answerName(createMatcher(prompt).match('Brandon Marshael'))).toBe('Brandon Marshall')
  })

  it('rejects other real players even if they are one edit from an answer', () => {
    expect(m.match('Peyton Manning').kind).toBe('wrong')
    expect(m.match('Tom Brady').kind).toBe('wrong')
  })

  it('does not typo-correct a guess that is itself a real last name', () => {
    // "Jones" is a real last name (Watt Jones); must not drift to some answer
    expect(m.match('Jones').kind).toBe('wrong')
  })

  it('maps typos of out-of-range players to out of range', () => {
    expect(m.match('Joe Namoth')).toMatchObject({ kind: 'outOfRange', entry: { name: 'Joe Namath' } })
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
    expect(answerName(bare.match('Odell Beckam'))).toBe('Odell Beckham Jr.')
    expect(bare.match('Tom Brady').kind).toBe('wrong')
  })
})
