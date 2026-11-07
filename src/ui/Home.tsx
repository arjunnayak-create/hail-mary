import { useTheme } from './theme'

export function TopBar(props: { muted: boolean; onMenu: () => void; onMute: () => void }) {
  return (
    <div className="topbar">
      <button className="icon-btn" aria-label="menu" onClick={props.onMenu}>
        <span className="burger" />
      </button>
      <button className="icon-btn" aria-label={props.muted ? 'unmute' : 'mute'} onClick={props.onMute}>
        {props.muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}

export function Home(props: {
  leaving: boolean
  gameNumber: number
  streak: number
  resumeAt: number | null
  total: number
  muted: boolean
  onStart: () => void
  onMenu: () => void
  onMute: () => void
}) {
  const { copy, Backdrop } = useTheme()
  return (
    <div className={`screen home ${props.leaving ? 'is-leaving' : ''}`}>
      <Backdrop variant="home" />
      <div className="home-inner">
        <TopBar muted={props.muted} onMenu={props.onMenu} onMute={props.onMute} />
        <div className="home-title">
          <h1 className="glitch logo" data-text={copy.title}>{copy.title}</h1>
          <p className="subtitle">{copy.subtitle}</p>
          <p className="tagline">{copy.tagline}</p>
        </div>
        <div className="home-cta">
          <button className="btn btn-cta" onClick={props.onStart}>
            {props.resumeAt !== null ? copy.resume(props.resumeAt + 1, props.total) : copy.cta}
          </button>
          <p className="label home-meta">
            {copy.gameLabel} #{props.gameNumber} · {copy.streakLabel} {props.streak}
          </p>
          <details className="howto panel">
            <summary>How to play</summary>
            <ul>
              {copy.howToPlay.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  )
}

export function Menu(props: { open: boolean; onClose: () => void; streak: number; best: number; played: number; avg: number }) {
  const { copy } = useTheme()
  if (!props.open) return null
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="menu">
        <div className="sheet-head">
          <span className="label is-primary">{copy.title}</span>
          <button className="icon-btn" onClick={props.onClose} aria-label="close">✕</button>
        </div>
        <h3 className="label">How to play</h3>
        <ul className="sheet-list">
          {copy.howToPlay.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <h3 className="label">Your stats</h3>
        <div className="stats">
          <div><b>{props.played}</b><span className="label">played</span></div>
          <div><b>{props.avg}</b><span className="label">avg</span></div>
          <div><b>{props.streak}</b><span className="label">streak</span></div>
          <div><b>{props.best}</b><span className="label">best</span></div>
        </div>
        <ul className="sheet-list dim">
          {copy.credits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
