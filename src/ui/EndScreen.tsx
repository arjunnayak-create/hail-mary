import { useEffect, useMemo, useState } from 'react'
import { msUntilNextDay } from '../engine/daily'
import type { SavedPlay } from '../engine/progress'
import { createMatcher, normalize, type NameIndex } from '../engine/matcher'
import type { ScoredPlay } from '../engine/scoring'
import { buildShareText, copyText, shareText } from '../engine/share'
import type { Answer, AnswerRef, Prompt } from '../engine/types'
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

/** Expanded round: every answer (rarest first) with a search box that uses the game matcher. */
function RoundAnswers({ prompt, mine, known }: { prompt: Prompt; mine: string | null; known: NameIndex | null }) {
  const { tiers, copy, TierIcon } = useTheme()
  const [q, setQ] = useState('')
  const matcher = useMemo(() => createMatcher(prompt, known ?? undefined), [prompt, known])
  const nq = normalize(q)
  const searching = nq.length >= 2
  const hit = searching ? matcher.match(q) : null
  const byName = (n: string) => [...prompt.answers, ...prompt.outOfRange].filter((a) => a.name === n)
  const hitIds = new Set<string>(
    hit?.kind === 'correct' ? [hit.answer.id]
      : hit?.kind === 'outOfRange' ? [hit.entry.id]
      : hit?.kind === 'suggest' ? hit.suggestions.flatMap((n) => byName(n).map((a) => a.id))
      : [],
  )
  // a single suggestion that is in this prompt reads like a direct hit
  const single = hit?.kind === 'suggest' && hit.suggestions.length === 1 ? byName(hit.suggestions[0])[0] : undefined
  const singleAnswer = single && 'tier' in single ? (single as Answer) : undefined
  const singleOor = single && !('tier' in single) ? single : undefined
  const visible = (a: AnswerRef) =>
    !searching || hitIds.has(a.id) || normalize(a.name).includes(nq) || a.aliases.some((x) => normalize(x).includes(nq))
  const rarestFirst = [...tiers.tiers].sort((a, b) => b.tier - a.tier)
  const tierOf = (a: Answer) => tiers.tiers.find((t) => t.tier === a.tier)!

  let summary: React.ReactNode = null
  const answerHit = hit?.kind === 'correct' ? hit.answer : singleAnswer
  const oorHit = hit?.kind === 'outOfRange' ? hit.entry : singleOor
  if (answerHit) {
    const t = tierOf(answerHit)
    summary = (
      <span style={{ ['--c' as string]: t.color }} className="search-hit">
        <TierIcon tier={t.tier} size={14} /> {answerHit.name} · <b>{t.name.toUpperCase()} · {t.points}</b>
      </span>
    )
  } else if (oorHit) {
    summary = <span className="search-hit is-oor">{oorHit.name} · <b>{copy.outOfRangeTag}</b></span>
  } else if (hit?.kind === 'suggest') {
    summary = (
      <span className="search-hit">
        {copy.didYouMean} {hit.suggestions.map((n) => {
          const a = byName(n)[0]
          const t = a && 'tier' in a ? tierOf(a as Answer) : null
          return (
            <b key={n} style={{ ['--c' as string]: t?.color ?? 'var(--dim)' }}>
              {n}{t ? ` (${t.name})` : a ? ` (${copy.outOfRangeTag})` : ' (not an answer)'}
            </b>
          )
        })}
      </span>
    )
  } else if (searching) {
    summary = <span className="search-hit dim">{copy.searchNoMatch}</span>
  }

  const groups = rarestFirst.map((t) => ({ t, list: prompt.answers.filter((a) => a.tier === t.tier && visible(a)).reverse() }))
  const oor = prompt.outOfRange.filter(visible)
  return (
    <div className="film-list">
      <div className="film-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={copy.searchPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="search answers"
        />
        <p className="film-search-result" aria-live="polite">{summary}</p>
      </div>
      {groups.map(({ t, list }) =>
        list.length === 0 ? null : (
          <div key={t.tier} className="film-tier" style={{ ['--c' as string]: t.color }}>
            <div className="film-tier-head">
              <TierIcon tier={t.tier} size={14} />
              <span>{t.name.toUpperCase()} · {t.points}</span>
              <span className="dim">{list.length}</span>
            </div>
            <div className="chips">
              {list.map((a) => (
                <span key={a.id} className={`chip ${a.id === mine ? 'is-mine' : ''} ${hitIds.has(a.id) ? 'is-hit' : ''}`} title={a.blurb}>
                  {a.name}
                </span>
              ))}
            </div>
            {list.filter((a) => a.blurb).slice(0, 1).map((a) => (
              <p key={a.id} className="film-blurb">{a.name}: {a.blurb}</p>
            ))}
          </div>
        ),
      )}
      {oor.length > 0 && (
        <div className="film-tier is-oor" style={{ ['--c' as string]: tiers.miss.color }}>
          <div className="film-tier-head">
            <span>{copy.outOfRangeTag.toUpperCase()}</span>
            <span className="dim">{oor.length}</span>
          </div>
          <div className="chips">
            {oor.map((a) => (
              <span key={a.id} className={`chip ${hitIds.has(a.id) ? 'is-hit' : ''}`}>
                {a.name} <em className="oor-tag">{copy.outOfRangeTag}</em>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilmRoom({ prompts, plays, scored, known }: { prompts: Prompt[]; plays: SavedPlay[]; scored: ScoredPlay[]; known: NameIndex | null }) {
  const { copy, TierIcon } = useTheme()
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
          return (
            <li key={p.id} className={isOpen ? 'is-open' : ''}>
              <button className="film-row" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                <span className="film-prompt">{p.text}</span>
                <span className="film-answer">{ans ? ans.name : '–'}</span>
                <TierIcon tier={s?.tier ?? null} size={20} />
                <span className="film-pts">{s ? s.points : 0}</span>
              </button>
              {isOpen && <RoundAnswers prompt={p} mine={play?.answerId ?? null} known={known} />}
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
  base: number
  streak: number
  known: NameIndex | null
  label?: string
  onMenu: () => void
  onStats: () => void
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
            <span className="label">{props.label ?? copy.completeTitle(props.gameNumber)}</span>
          </header>
          <section className="end-score">
            <span className="big-score">{shown}</span>
            <span className="of">{copy.pointsUnit}</span>
            <p className="score-split">
              {copy.basePoints} {props.base}
              {props.bonus > 0 && <span className="hot"> + 🔥 {props.bonus} {copy.multiplierLabel}</span>}
            </p>
            <p className="label">
              {distance} {copy.distanceUnit} total · {copy.streakLabel} {props.streak}
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
            <button className="btn btn-secondary btn-wide" onClick={props.onStats}>
              {copy.statsButton}
            </button>
          </div>
          <FilmRoom prompts={props.prompts} plays={props.plays} scored={props.scored} known={props.known} />
          <NextGame />
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
