/** Game flow state machine: load → home → (pre → play → throw → reveal) × N → end. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dailyPromptIds, dayIndex } from '../engine/daily'
import { buildNameIndex, createMatcher, type NameIndex, type PromptMatcher } from '../engine/matcher'
import {
  completeDay, currentStreak, emptySave, finalizeDay, recordPlay, resumeDay, startDay, type DayRecord, type SaveState,
  type SavedPlay,
} from '../engine/progress'
import { mulberry32, seededShuffle } from '../engine/rng'
import { scorePlays, totals } from '../engine/scoring'
import { createStore } from '../engine/storage'
import type { Prompt, PromptsFile } from '../engine/types'
import type { Theme } from './theme'

export type Phase = 'loading' | 'error' | 'home' | 'pre' | 'play' | 'throw' | 'reveal' | 'end'

export interface Feedback {
  text: string
  key: number
}

export interface ThrowInfo {
  key: number
  mode: 'idle' | 'throw' | 'miss'
  tier: number | null
  label: string
}

/**
 * Dev-only URL flags (stripped from production builds by the DEV guard):
 *   ?reset   clear today's game and the streak, then play normally
 *   ?random  play a random 7-prompt game held only in memory (daily progress, streak and
 *            stats are never read or written)
 */
function devFlags(): { reset: boolean; random: boolean } {
  if (!import.meta.env.DEV) return { reset: false, random: false }
  const q = new URLSearchParams(window.location.search)
  return { reset: q.has('reset'), random: q.has('random') }
}

function memoryStore(): { load(): SaveState; save(s: SaveState): void } {
  let v = emptySave()
  return { load: () => v, save: (s) => void (v = s) }
}

export function useGame(theme: Theme, inputRef: React.RefObject<HTMLInputElement | null>) {
  const dev = useMemo(devFlags, [])
  const store = useMemo(
    () => (dev.random ? memoryStore() : createStore<SaveState>(`${theme.id}:v1`, emptySave)),
    [theme.id, dev.random],
  )
  const [phase, setPhase] = useState<Phase>('loading')
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [save, setSave] = useState<SaveState>(() => store.load())
  const [rec, setRec] = useState<DayRecord | null>(null)
  const [today, setToday] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [clockStart, setClockStart] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  /** "Did you mean …?" names awaiting confirmation, and the exact text they were made for. */
  const [suggest, setSuggest] = useState<{ forText: string; names: string[] }>({ forText: '', names: [] })
  const setSuggestions = useCallback((names: string[], forText = '') => setSuggest({ forText, names }), [])
  const [throwInfo, setThrowInfo] = useState<ThrowInfo>({ key: 0, mode: 'idle', tier: null, label: '' })
  const known = useRef<NameIndex | null>(null)
  const matchers = useRef(new Map<string, PromptMatcher>())
  const saveRef = useRef(save)
  saveRef.current = save
  const recRef = useRef(rec)
  recRef.current = rec

  useEffect(() => theme.sounds.setMuted(save.muted), [save.muted, theme.sounds])

  // ---- load
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(theme.dataUrl).then((r) => r.json() as Promise<PromptsFile>),
      fetch(theme.namesUrl).then((r) => r.json() as Promise<{ names: string[] }>).catch(() => ({ names: [] })),
    ])
      .then(([data, names]) => {
        if (cancelled) return
        known.current = buildNameIndex(names.names)
        const day = dayIndex(new Date(), theme.daily)
        const byId = new Map(data.prompts.map((p) => [p.id, p]))
        const pool = data.prompts.map((p) => ({ id: p.id, category: p.category }))
        const ids = dev.random
          ? seededShuffle(pool, mulberry32((Math.random() * 2 ** 32) >>> 0)).slice(0, theme.daily.perDay).map((p) => p.id)
          : dailyPromptIds(pool, day, theme.daily)
        if (import.meta.env.DEV && dev.reset) {
          const s = store.load()
          const days = { ...s.days }
          delete days[day]
          store.save({ ...s, days, streak: 0, lastCompletedDay: null })
          window.history.replaceState(null, '', window.location.pathname)
        }
        const s0 = store.load()
        const r0 = startDay(s0, day, ids)
        const r1 = resumeDay(r0)
        const r2 = finalizeDay(r1, theme.tiers, theme.id)
        let s1 = { ...s0, days: { ...s0.days, [day]: r2 } }
        if (r2.completed) s1 = completeDay(s1, r2)
        store.save(s1)
        setToday(day)
        setPrompts(ids.map((id) => byId.get(id)!).filter(Boolean))
        setSave(s1)
        setRec(r2)
        setPhase(r2.completed ? 'end' : 'home')
      })
      .catch(() => !cancelled && setPhase('error'))
    return () => {
      cancelled = true
    }
  }, [theme, store, dev])

  const persist = useCallback(
    (r0: DayRecord) => {
      const r = finalizeDay(r0, theme.tiers, theme.id)
      let s = { ...saveRef.current, days: { ...saveRef.current.days, [r.day]: r } }
      if (r.completed) s = completeDay(s, r)
      store.save(s)
      setSave(s)
      setRec(r)
    },
    [store, theme],
  )

  const index = rec?.plays.length ?? 0
  const prompt = prompts[index] as Prompt | undefined
  const matcher = useMemo(() => {
    if (!prompt) return null
    let m = matchers.current.get(prompt.id)
    if (!m) {
      m = createMatcher(prompt, known.current ?? undefined)
      matchers.current.set(prompt.id, m)
    }
    return m
  }, [prompt])

  // ---- pre-prompt countdown
  const countdownTimer = useRef<number | null>(null)
  const beginCountdown = useCallback(() => {
    // never focus the input here: the keyboard opens only when the player taps the text box
    setFeedback(null)
    setSuggestions([])
    setThrowInfo((t) => ({ ...t, mode: 'idle' }))
    setPhase('pre')
    let n = theme.countdownSeconds
    setCountdown(n)
    theme.sounds.play('countdown')
    if (countdownTimer.current) window.clearInterval(countdownTimer.current)
    countdownTimer.current = window.setInterval(() => {
      n -= 1
      if (n > 0) {
        setCountdown(n)
        theme.sounds.play('countdown')
        return
      }
      window.clearInterval(countdownTimer.current!)
      countdownTimer.current = null
      theme.sounds.play('go')
      const r = recRef.current
      if (r) persist({ ...r, activeIndex: r.plays.length })
      if (inputRef.current) inputRef.current.value = ''
      setClockStart(performance.now())
      setPhase('play')
    }, 1000)
  }, [inputRef, persist, theme])

  useEffect(() => () => {
    if (countdownTimer.current) window.clearInterval(countdownTimer.current)
  }, [])

  const kickOff = useCallback(() => {
    theme.sounds.unlock()
    theme.sounds.play('start')
    beginCountdown()
  }, [beginCountdown, theme])

  const resolve = useCallback(
    (play: SavedPlay, mode: 'throw' | 'miss', label: string) => {
      const r = recRef.current
      if (!r) return
      persist(recordPlay(r, play))
      setClockStart(null)
      setFeedback(null)
      setSuggestions([])
      // accepted or timed out: close the keyboard completely; it stays closed through the
      // throw, the reveal and the next countdown until the player taps the text box again
      const el = inputRef.current
      if (el) {
        el.value = ''
        el.blur()
      }
      setThrowInfo((t) => ({ key: t.key + 1, mode, tier: play.tier, label }))
      setPhase('throw')
    },
    [inputRef, persist, setSuggestions],
  )

  const submit = useCallback(
    (guess: string) => {
      if (phase !== 'play' || !prompt || !matcher) return
      const g = guess.trim()
      if (!g) return
      const res = matcher.match(g)
      setSuggestions([])
      if (res.kind === 'correct') {
        resolve({ promptId: prompt.id, guess: g, answerId: res.answer.id, tier: res.answer.tier }, 'throw', res.answer.name)
        return
      }
      if (res.kind === 'suggest') {
        // confirm before throwing; the clock keeps running
        setFeedback(null)
        setSuggestions(res.suggestions, guess)
        theme.sounds.play('click')
        return
      }
      const text =
        res.kind === 'outOfRange' ? theme.copy.outOfRange(g) : res.kind === 'ambiguous' ? theme.copy.ambiguous(g) : theme.copy.wrong(g)
      setFeedback((f) => ({ text, key: (f?.key ?? 0) + 1 }))
      theme.sounds.play('wrong')
      // wrong guess: the input keeps focus (SNAP doesn't steal it), so the keyboard stays open.
      // Select the bad guess so typing replaces it, without ever focusing programmatically.
      const el = inputRef.current
      if (el && document.activeElement === el) el.setSelectionRange(0, el.value.length)
    },
    [phase, prompt, matcher, resolve, theme, inputRef, setSuggestions],
  )

  /** Accept a suggestion: it is submitted as if typed, and judged exactly. */
  const pick = useCallback(
    (name: string) => {
      if (inputRef.current) inputRef.current.value = name
      submit(name)
    },
    [inputRef, submit],
  )

  const dismissSuggestions = useCallback(() => setSuggest((s) => (s.names.length ? { forText: '', names: [] } : s)), [])

  const timeout = useCallback(() => {
    if (!prompt) return
    resolve({ promptId: prompt.id, guess: '', answerId: null, tier: null }, 'miss', '')
  }, [prompt, resolve])

  const throwDone = useCallback(() => {
    setPhase('reveal')
    const last = recRef.current?.plays.at(-1)
    if (last?.tier) theme.sounds.play('reveal', { tier: last.tier })
    else theme.sounds.play('miss')
  }, [theme])

  const next = useCallback(() => {
    theme.sounds.play('click')
    if (recRef.current?.completed) {
      theme.sounds.play('end')
      setThrowInfo((t) => ({ ...t, mode: 'idle' }))
      setPhase('end')
      return
    }
    beginCountdown()
  }, [beginCountdown, theme])

  const toggleMute = useCallback(() => {
    theme.sounds.unlock()
    const s = { ...saveRef.current, muted: !saveRef.current.muted }
    store.save(s)
    setSave(s)
  }, [store, theme])

  const scored = useMemo(() => scorePlays(theme.tiers, (rec?.plays ?? []).map((p) => ({ tier: p.tier }))), [rec, theme.tiers])
  const sums = useMemo(() => totals(scored), [scored])

  return {
    phase, prompts, prompt, index, rec, save, today, countdown, clockStart, feedback, throwInfo, suggestions: suggest.names, suggestionsFor: suggest.forText,
    known: known.current, randomMode: dev.random,
    scored, sums, streak: currentStreak(save, today),
    kickOff, submit, pick, dismissSuggestions, timeout, throwDone, next, toggleMute,
  }
}
