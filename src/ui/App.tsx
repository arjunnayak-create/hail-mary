import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { scorePlays, totals } from '../engine/scoring'
import { useCountdown } from '../engine/timer'
import { prefersReducedMotion, useVisualViewport } from '../engine/viewport'
import { EndScreen } from './EndScreen'
import { Home, Menu, TopBar } from './Home'
import { Hud, InputDock, PromptCard, RevealCard } from './Play'
import { ThemeContext, type Theme } from './theme'
import { useGame } from './useGame'
import './ui.css'

/** Track an element's size; `ready` re-attaches once the element is actually mounted. */
function useMeasure(ref: React.RefObject<HTMLElement | null>, pick: (r: DOMRect) => number, ready: boolean) {
  const [v, setV] = useState(0)
  const pickRef = useRef(pick)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setV(pickRef.current(el.getBoundingClientRect()))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, ready])
  return v
}

function Game({ theme }: { theme: Theme }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const g = useGame(theme, inputRef)
  const { keyboardOpen } = useVisualViewport()
  const [menu, setMenu] = useState(false)
  const [homeGone, setHomeGone] = useState(false)
  const distRef = useRef<HTMLSpanElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const ready = g.phase !== 'loading' && g.phase !== 'error'
  const topBottom = useMeasure(topRef, (r) => r.bottom, ready)
  const dockH = useMeasure(dockRef, (r) => r.height, ready)

  const total = theme.secondsPerPrompt * 1000
  const remaining = useCountdown(g.phase === 'play' ? g.clockStart : null, total, g.timeout)
  const secs = Math.ceil(remaining / 1000)
  useEffect(() => {
    if (g.phase === 'play' && secs <= 5 && secs > 0) theme.sounds.play('tick')
  }, [secs, g.phase, theme])

  useEffect(() => {
    if (g.phase === 'pre' || g.phase === 'play') {
      if (distRef.current) distRef.current.textContent = '0'
    }
  }, [g.phase, g.index])

  // leave the home screen with a pan
  useEffect(() => {
    if (g.phase === 'home') setHomeGone(false)
  }, [g.phase])

  const n = g.prompts.length || theme.daily.perDay
  const playing = g.phase === 'pre' || g.phase === 'play'
  const flying = g.phase === 'throw' || g.phase === 'reveal'
  const lastPlay = g.scored.at(-1)
  const lastSaved = g.rec?.plays.at(-1)
  const lastPrompt = g.rec ? g.prompts[g.rec.plays.length - 1] : undefined
  const lastAnswer = lastSaved?.answerId ? lastPrompt?.answers.find((a) => a.id === lastSaved.answerId) : undefined
  const scoreShown = g.phase === 'throw' ? g.sums.total - (lastPlay?.points ?? 0) : g.sums.total
  const streakNow = g.scored.at(-1)?.streak ?? 0
  const mults = theme.tiers.streakBonus.multipliers
  const nextMult = streakNow > 0 ? mults[Math.min(streakNow + 1, mults.length) - 1] : 1
  const doneCount = g.rec?.plays.length ?? 0
  const playedDays = Object.values(g.save.days).filter((d) => d.completed)
  const played = playedDays.length
  const avg = played
    ? Math.round(playedDays.reduce((a, d) => a + totals(scorePlays(theme.tiers, d.plays)).total, 0) / played)
    : 0

  if (g.phase === 'loading' || g.phase === 'error') {
    return (
      <div className="app-root" style={theme.cssVars as React.CSSProperties}>
        <div className="loading">
          <span className="glitch logo" data-text={theme.copy.title}>{theme.copy.title}</span>
          <p className="label">{g.phase === 'error' ? 'could not load today’s game. check your connection.' : 'warming up…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={`app-root ${keyboardOpen ? 'kb-open' : ''}`} style={theme.cssVars as React.CSSProperties}>
      <div className="stage">
        <div className={`screen play phase-${g.phase}`}>
          <theme.ThrowScene
            mode={g.throwInfo.mode}
            playKey={g.throwInfo.key}
            tier={g.throwInfo.tier}
            label={g.throwInfo.label}
            insetTop={topBottom}
            insetBottom={flying ? 0 : dockH}
            reducedMotion={prefersReducedMotion()}
            onDistance={(d) => {
              if (distRef.current) distRef.current.textContent = String(Math.round(d))
            }}
            onDone={g.throwDone}
          />
          <div className={`danger-vignette ${g.phase === 'play' && remaining <= 5000 ? 'is-on' : ''}`} />
          <div ref={topRef} className="play-top">
            <div className="play-bar">
              <TopBar muted={g.save.muted} onMenu={() => setMenu(true)} onMute={g.toggleMute} />
            </div>
            <Hud
              index={flying ? g.index - 1 : g.index}
              total={n}
              done={g.phase === 'throw' ? doneCount - 1 : doneCount}
              score={scoreShown}
              distRef={distRef}
            />
            {g.prompt && (
              <div className={`prompt-slot ${g.phase === 'play' ? 'is-on' : ''}`}>
                <PromptCard prompt={g.prompt} index={g.index} total={n} nextMultiplier={nextMult} compact={keyboardOpen} />
              </div>
            )}
          </div>
          {g.phase === 'pre' && (
            <div className="pre-pill" style={{ bottom: dockH + 14 }}>
              {theme.copy.preCountdown} <b>{g.countdown}</b>
            </div>
          )}
          <div ref={dockRef} className={`dock-wrap ${playing ? 'is-on' : ''}`}>
            <InputDock
              inputRef={inputRef}
              active={g.phase === 'play'}
              remaining={remaining}
              total={total}
              feedback={g.feedback}
              onSubmit={g.submit}
            />
          </div>
          {g.phase === 'reveal' && lastPlay && (
            <RevealCard
              play={lastPlay}
              answerName={lastAnswer?.name ?? null}
              blurb={lastAnswer?.blurb}
              isLast={!!g.rec?.completed}
              onNext={g.next}
            />
          )}
        </div>

        {(g.phase === 'home' || !homeGone) && g.phase !== 'end' && (
          <Home
            leaving={g.phase !== 'home'}
            gameNumber={g.today + 1}
            streak={g.streak}
            resumeAt={doneCount > 0 ? doneCount : null}
            total={n}
            muted={g.save.muted}
            onStart={() => {
              g.kickOff()
              window.setTimeout(() => setHomeGone(true), 800)
            }}
            onMenu={() => setMenu(true)}
            onMute={g.toggleMute}
          />
        )}

        {g.phase === 'end' && g.rec && (
          <EndScreen
            gameNumber={g.today + 1}
            prompts={g.prompts}
            plays={g.rec.plays}
            scored={g.scored}
            total={g.sums.total}
            bonus={g.sums.bonus}
            streak={g.streak}
            onMenu={() => setMenu(true)}
          />
        )}
        <Menu open={menu} onClose={() => setMenu(false)} streak={g.streak} best={g.save.bestStreak} played={played} avg={avg} />
      </div>
      <div className="crt" aria-hidden />
    </div>
  )
}

export default function App({ theme }: { theme: Theme }) {
  return (
    <ThemeContext.Provider value={theme}>
      <Game theme={theme} />
    </ThemeContext.Provider>
  )
}
