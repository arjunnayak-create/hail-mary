import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { nflTheme } from './themes/nfl'
import App from './ui/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App theme={nflTheme} />
  </StrictMode>,
)
