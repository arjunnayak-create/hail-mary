import { useEffect, useRef, type RefObject } from 'react'
import type { ScoredPlay } from '../engine/scoring'
import type { Prompt } from '../engine/types'
import type { Feedback } from './useGame'
import { useTheme } from './theme'

export function Hud(props: {
  index: number
  total: number
  done: number
  score: number
  distRef: RefObject<HTMLSpanElement | null>
}) {
  const { copy } = useTheme()
  return (
    <header className="hud">
      <div className="hud-panel panel is-secondary">
        <span className="label">{copy.distanceLabel}</span>
        <span className="hud-num" ref={props.distRef}>0</span>
      </div>
      <div className="hud-center">
        <span className="label">{copy.promptLabel(Math.min(props.index + 1, props.total), props.total)}</span>
        <div className="pips" aria-hidden>
          {Array.from({ length: props.total }, (_, i) => (
            <i key={i} className={i < props.done ? 'is-done' : i === props.index ? 'is-current' : ''} />
          ))}
        </div>
      </div>
      <div className="hud-panel panel is-primary">
        <span className="label">{copy.scoreLabel}</span>
        <span className="hud-num">{props.score}</span>
      </div>
    </header>
  )
}

export function PromptCard(props: { prompt: Prompt; index: number; total: number; nextMultiplier: number; compact: boolean }) {
  const { copy } = useTheme()
  return (
    <section className={`prompt-card panel ${props.compact ? 'is-compact' : ''}`}>
      <div className="prompt-top">
        <span className="label is-primary">{copy.promptLabel(props.index + 1, props.total)}</span>
        {props.nextMultiplier > 1 && (
          <span className="chip-hot">🔥 {copy.multiplierLabel} ×{props.nextMultiplier}</span>
        )}
      </div>
      <h2 className="prompt-text">{props.prompt.text}</h2>
      <p className="prompt-qual">{props.prompt.qualifier}</p>
      {!props.compact && <p className="prompt-hint">{copy.promptHint}</p>}
    </section>
  )
}

export function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 19
  const c = 2 * Math.PI * r
  const frac = Math.max(0, remaining / total)
  const secs = Math.ceil(remaining / 1000)
  return (
    <div className={`timer-ring ${secs <= 5 ? 'is-danger' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} className="ring-bg" />
        <circle cx="22" cy="22" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span>{secs}</span>
    </div>
  )
}

export function InputDock(props: {
  inputRef: RefObject<HTMLInputElement | null>
  active: boolean
  remaining: number
  total: number
  feedback: Feedback | null
  onSubmit: (v: string) => void
}) {
  const { copy } = useTheme()
  const danger = props.active && props.remaining <= 5000
  const lineRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = lineRef.current
    if (!el || !props.feedback) return
    el.classList.remove('is-shake')
    void el.offsetWidth
    el.classList.add('is-shake')
  }, [props.feedback])

  const submit = () => props.inputRef.current && props.onSubmit(props.inputRef.current.value)
  return (
    <footer className="dock">
      <p ref={lineRef} className="feedback" aria-live="polite">{props.active ? props.feedback?.text ?? '' : ''}</p>
      <form
        className="dock-row"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <TimerRing remaining={props.active ? props.remaining : props.total} total={props.total} />
        <input
          ref={props.inputRef}
          className={`answer-input ${danger ? 'is-danger' : ''}`}
          placeholder={copy.placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="answer"
          readOnly={false}
          onChange={(e) => {
            if (!props.active) e.currentTarget.value = '' // no typing ahead during the countdown
          }}
        />
        <button
          type="submit"
          className="btn btn-snap"
          // keep the input focused (and the keyboard up) when tapping SNAP
          onPointerDown={(e) => e.preventDefault()}
        >
          {copy.submit}
        </button>
      </form>
      <div className="drain">
        <i style={{ transform: `scaleX(${props.active ? props.remaining / props.total : 1})` }} />
      </div>
    </footer>
  )
}

export function RevealCard(props: {
  play: ScoredPlay
  answerName: string | null
  blurb?: string
  isLast: boolean
  onNext: () => void
}) {
  const { tiers, copy, TierIcon } = useTheme()
  const rule = props.play.tier === null ? null : tiers.tiers.find((t) => t.tier === props.play.tier)!
  const color = rule?.color ?? tiers.miss.color
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const t = window.setTimeout(() => btn.current?.focus({ preventScroll: true }), 600)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className="reveal" style={{ ['--c' as string]: color }}>
      <div className="reveal-card">
        <div className="reveal-icon">
          <TierIcon tier={props.play.tier} size={88} glow />
        </div>
        <h2 className="reveal-tier glitch" data-text={(rule?.name ?? copy.missTitle).toUpperCase()}>
          {(rule?.name ?? copy.missTitle).toUpperCase()}
        </h2>
        <p className="reveal-answer">{props.answerName ? `"${props.answerName}"` : '–'}</p>
        <p className="reveal-points">
          {props.play.multiplier > 1 ? (
            <>
              <b>+{props.play.base}</b> × {props.play.multiplier} = <b>{props.play.points} {copy.pointsUnit}</b>
            </>
          ) : (
            <b>+{props.play.points} {copy.pointsUnit}</b>
          )}
          {rule && <span className="dim"> · {rule.distance} {copy.distanceUnit}</span>}
        </p>
        {props.play.multiplier > 1 && <p className="reveal-hot">🔥 {copy.multiplierLabel} ×{props.play.multiplier}</p>}
        <p className="reveal-quip">{props.blurb || rule?.quip || tiers.miss.quip}</p>
        <button ref={btn} className="btn btn-primary" onClick={props.onNext}>
          {props.isLast ? copy.final : copy.next}
        </button>
      </div>
    </div>
  )
}
