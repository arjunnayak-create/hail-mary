/** Renders the 1200x630 link-preview card from the real theme art. Screenshot by make-assets.mjs. */
import { createRoot } from 'react-dom/client'
import { nflTheme } from '../src/themes/nfl'
import '../src/ui/ui.css'

const { Backdrop, copy, cssVars } = nflTheme

function Card() {
  return (
    <div className="app-root" style={{ ...(cssVars as React.CSSProperties), position: 'fixed', inset: 0, height: 630 }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Backdrop variant="home" />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(7,10,26,0.2), rgba(7,10,26,0) 40%, rgba(7,10,26,0.55))' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center' }}>
        <h1 className="glitch logo" data-text={copy.title} style={{ fontSize: 92, margin: 0 }}>{copy.title}</h1>
        <div style={{ display: 'inline-block', marginTop: 28, padding: '18px 34px 20px', background: 'rgba(7,10,26,0.82)', boxShadow: '0 -3px 0 #ff4f8b, 0 3px 0 #ff4f8b, -3px 0 0 #ff4f8b, 3px 0 0 #ff4f8b' }}>
          <p className="subtitle" style={{ fontSize: 22, margin: 0 }}>{copy.subtitle}</p>
          <p style={{ font: '700 24px/1.4 var(--font-mono)', color: '#fff', margin: '14px 0 0' }}>{copy.tagline}</p>
        </div>
      </div>
      <div className="crt" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Card />)
