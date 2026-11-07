import { useMemo } from 'react'
import { computeStats, type SaveState } from '../engine/progress'
import { useTheme } from './theme'

/** Local-only stats: everything is computed from the saved game history. */
export function StatsScreen(props: { save: SaveState; today: number; onClose: () => void }) {
  const { tiers, copy, TierIcon } = useTheme()
  const st = useMemo(() => computeStats(props.save, props.today, tiers), [props.save, props.today, tiers])
  const rows = [...tiers.tiers.map((t) => ({ key: String(t.tier), tier: t.tier as number | null, name: t.name, color: t.color })),
    { key: 'miss', tier: null, name: tiers.miss.name, color: tiers.miss.color }]
  const maxCount = Math.max(1, ...rows.map((r) => st.tierCounts[r.key] ?? 0))
  const maxScore = Math.max(1, ...st.history.map((h) => h.total))

  return (
    <div className="screen stats-screen" role="dialog" aria-label="stats">
      <div className="end-scroll">
        <div className="end-col">
          <header className="end-head">
            <span className="label is-primary">{copy.statsTitle}</span>
            <button className="icon-btn stats-close" onClick={props.onClose} aria-label="close">✕</button>
          </header>
          <section className="stat-tiles">
            {[
              [st.played, copy.statPlayed],
              [st.average, copy.statAverage],
              [st.high, copy.statHigh],
              [st.streak, copy.statStreak],
              [st.bestStreak, copy.statBest],
            ].map(([v, l]) => (
              <div key={String(l)} className="panel stat-tile">
                <b>{v}</b>
                <span className="label">{l}</span>
              </div>
            ))}
          </section>
          <section className="end-block panel">
            <h3 className="label">{copy.statTiers}</h3>
            <ul className="tier-bars">
              {rows.map((r) => {
                const n = st.tierCounts[r.key] ?? 0
                return (
                  <li key={r.key} style={{ ['--c' as string]: r.color }}>
                    <TierIcon tier={r.tier} size={18} />
                    <span className="tier-bar-name">{r.name}</span>
                    <span className="tier-bar"><i style={{ width: `${(n / maxCount) * 100}%` }} /></span>
                    <b>{n}</b>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="end-block panel">
            <h3 className="label">{copy.statHistory(st.history.length)}</h3>
            {st.history.length === 0 ? (
              <p className="dim">{copy.statEmpty}</p>
            ) : (
              <div className="history">
                {st.history.map((h) => (
                  <div key={h.day} className="history-col" title={`#${h.day + 1}: ${h.total}`}>
                    <i style={{ height: `${(h.total / maxScore) * 100}%` }} />
                  </div>
                ))}
              </div>
            )}
            {st.history.length > 0 && (
              <div className="history-x label">
                <span>#{st.history[0].day + 1}</span>
                <span>max {maxScore}</span>
                <span>#{st.history[st.history.length - 1].day + 1}</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
