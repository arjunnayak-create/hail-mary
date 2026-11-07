import { useEffect, useMemo, useState } from 'react'
import { msUntilNextDay } from '../engine/daily'
import type { SavedPlay } from '../engine/progress'
import { maxBaseScore, type ScoredPlay } from '../engine/scoring'
import { buildShareText, copyText, shareText } from '../engine/share'
import type { Prompt } from '../engine/types'
import { useTheme } from './theme'

function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

function NextGame() {
  const { copy, daily } = useTheme()
  const [ms, setMs] = useState(() => msUntilNextDay(new Date(), daily.timeZone))
  useEffect(() => {
    const id = window.setInterval(() => {
      const left = msUntilNextDay(new Date(), daily.timeZone)
      setMs(left)
      if (left <= 1000) window.setTimeout(() => window.location.reload(), 1500)
    }, 1000)
    return () => window.clearInterval(id)
  }, [daily.timeZone])
  const s = Math.floor(ms / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <p className="next-game">
      <span className="label">{copy.nextGameIn}</span> <b>{hh}:{mm}:{ss}</b>
    </p>
  )
}

function PlayChart({ scored }: { scored: ScoredPlay[] }) {
  const { tiers, copy, TierIcon } = useTheme()
  const max = Math.max(...tiers.tiers.map((t) => t.distance))
  return (
    <section className="end-block panel">
      <h3 className="label">{copy.logTitle} <span className="dim">· {copy.logSubtitle}</span></h3>
      <div className="chart">
        {tiers.tiers.map((t) => (
          <div key={t.tier} className="chart-line" style={{ bottom: `${(t.distance / max) * 100}%`, ['--c' as string]: t.color }}>
            <span>{t.distance}</span>
          </div>
        ))}
        <div className="chart-cols">
          {scored.map((p, i) => {
            const rule = p.tier === null ? null : tiers.tiers.find((t) => t.tier === p.tier)!
            const h = rule ? (rule.distance / max) * 100 : 0
            return (
              <div key={i} className="chart-col" style={{ ['--c' as string]: rule?.color ?? tiers.miss.color }}>
                <div className="chart-bar" style={{ height: `${h}%`, animationDelay: `${0.25 + i * 0.12}s` }}>
                  <span className="chart-icon">
                    <TierIcon tier={p.tier} size={20} />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="chart-x">
        {scored.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
    </section>
  )
}

function FilmRoom({ prompts, plays, scored }: { prompts: Prompt[]; plays: SavedPlay[]; scored: ScoredPlay[] }) {
  const { tiers, copy, TierIcon } = useTheme()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="end-block panel">
      <h3 className="label">{copy.catchTitle} <span className="dim">· {copy.catchSubtitle}</span></h3>
      <ul className="film">
        {prompts.map((p, i) => {
          const play = plays[i]
          const s = scored[i]
          const ans = play?.answerId ? p.answers.find((a) => a.id === play.answerId) : null
          const isOpen = open === i
          const rarestFirst = [...tiers.tiers].sort((a, b) => b.tier - a.tier)
          return (
            <li key={p.id} className={isOpen ? 'is-open' : ''}>
              <button className="film-row" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                <span className="film-prompt">{p.text}</span>
                <span className="film-answer">{ans ? ans.name : '–'}</span>
                <TierIcon tier={s?.tier ?? null} size={20} />
                <span className="film-pts">{s ? s.points : 0}</span>
              </button>
              {isOpen && (
                <div className="film-list">
                  {rarestFirst.map((t) => {
                    const list = p.answers.filter((a) => a.tier === t.tier).reverse()
                    if (!list.length) return null
                    return (
                      <div key={t.tier} className="film-tier" style={{ ['--c' as string]: t.color }}>
                        <div className="film-tier-head">
                          <TierIcon tier={t.tier} size={14} />
                          <span>{t.name.toUpperCase()} · {t.points}</span>
                          <span className="dim">{list.length}</span>
                        </div>
                        <div className="chips">
                          {list.map((a) => (
                            <span key={a.id} className={`chip ${a.id === play?.answerId ? 'is-mine' : ''}`} title={a.blurb}>
                              {a.name}
                            </span>
                          ))}
                        </div>
                        {list.filter((a) => a.blurb).slice(0, 1).map((a) => (
                          <p key={a.id} className="film-blurb">{a.name}: {a.blurb}</p>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function EndScreen(props: {
  gameNumber: number
  prompts: Prompt[]
  plays: SavedPlay[]
  scored: ScoredPlay[]
  total: number
  bonus: number
  streak: number
  onMenu: () => void
}) {
  const theme = useTheme()
  const { copy, tiers, bands, Backdrop } = theme
  const shown = useCountUp(props.total)
  const [toast, setToast] = useState<string | null>(null)
  const distance = props.scored.reduce((a, p) => a + (p.tier ? tiers.tiers.find((t) => t.tier === p.tier)!.distance : 0), 0)
  const band = [...bands].reverse().find((b) => props.total >= b.min) ?? bands[0]
  const text = useMemo(
    () => buildShareText(tiers, { title: copy.shareTitle, gameNumber: props.gameNumber, total: props.total, unit: 'pts', plays: props.scored, url: theme.shareUrl }),
    [tiers, copy.shareTitle, props.gameNumber, props.total, props.scored, theme.shareUrl],
  )
  const flash = (m: string) => {
    setToast(m)
    window.setTimeout(() => setToast(null), 1800)
  }

  return (
    <div className="screen end">
      <Backdrop variant="end" />
      <div className="end-scroll">
        <div className="end-col">
          <header className="end-head">
            <button className="icon-btn" aria-label="menu" onClick={props.onMenu}><span className="burger" /></button>
            <span className="glitch logo-sm" data-text={copy.title}>{copy.title}</span>
            <span className="label">{copy.completeTitle(props.gameNumber)}</span>
          </header>
          <section className="end-score">
            <span className="big-score">{shown}</span>
            <span className="of">/{maxBaseScore(tiers, props.prompts.length)}</span>
            <p className="label">
              {distance} {copy.distanceUnit} total · {copy.streakLabel} {props.streak}
              {props.bonus > 0 && <span className="hot"> · 🔥 +{props.bonus} {copy.multiplierLabel}</span>}
            </p>
          </section>
          <PlayChart scored={props.scored} />
          <section className="end-block panel">
            <h3 className="label">{copy.bandsTitle}</h3>
            <ul className="bands">
              {bands.map((b, i) => {
                const nextMin = bands[i + 1]?.min
                return (
                  <li key={b.min} className={b === band ? 'is-me' : ''}>
                    <span className="band-range">{nextMin ? `${b.min}–${nextMin - 1}` : `${b.min}+`}</span>
                    <span><b>{b.title}</b> {b.text}</span>
                  </li>
                )
              })}
            </ul>
          </section>
          <div className="end-actions">
            <button
              className="btn btn-primary btn-wide"
              onClick={async () => flash((await copyText(text)) ? copy.copied : 'copy failed')}
            >
              {copy.copyResult}
            </button>
            <button
              className="btn btn-secondary btn-wide"
              onClick={async () => {
                const r = await shareText(text)
                if (r === 'copied') flash(copy.copied)
              }}
            >
              {copy.share}
            </button>
            <pre className="share-preview">{text}</pre>
          </div>
          <FilmRoom prompts={props.prompts} plays={props.plays} scored={props.scored} />
          <NextGame />
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
