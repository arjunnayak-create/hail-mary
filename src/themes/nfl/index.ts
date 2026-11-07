/** The NFL theme: everything football lives in this folder. */
import '@fontsource/press-start-2p/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import './theme.css'
import type { TierConfig } from '../../engine/types'
import type { Theme } from '../../ui/theme'
import { bands, copy } from './copy'
import { FieldScene } from './FieldScene'
import { sounds } from './sound'
import { StadiumScene } from './StadiumScene'
import { TierIcon } from './TierIcon'
import tiersJson from './tiers.json'

export const nflTheme: Theme = {
  id: 'hailmary',
  daily: {
    epoch: '2026-11-07',
    timeZone: 'America/New_York',
    perDay: 7,
    maxPerCategory: { default: 2, team: 3 },
    salt: 'hail-mary-v1',
  },
  secondsPerPrompt: 25,
  countdownSeconds: 3,
  dataUrl: '/data/prompts.json',
  namesUrl: '/data/names.json',
  // single config value: VITE_SITE_URL in .env (shown without the protocol in share text)
  shareUrl: (import.meta.env.VITE_SITE_URL ?? '').replace(/^https?:\/\//, ''),
  tiers: tiersJson as TierConfig,
  copy,
  bands,
  sounds,
  cssVars: {
    '--bg': '#070a1a',
    '--bg-2': '#0e1330',
    '--panel': 'rgba(12, 16, 42, 0.86)',
    '--panel-border': 'rgba(214, 222, 255, 0.55)',
    '--text': '#eef1ff',
    '--dim': '#8890b5',
    '--primary': '#ff4f8b',
    '--secondary': '#4fe3ff',
    '--done': '#ffd23f',
    '--warn': '#ff9a4c',
    '--danger': '#ff3b4f',
    '--accent': '#3fbf5a',
    '--font-pixel': "'Press Start 2P', ui-monospace, monospace",
    '--font-mono': "'JetBrains Mono', ui-monospace, Menlo, monospace",
  },
  Backdrop: StadiumScene,
  ThrowScene: FieldScene,
  TierIcon,
}
