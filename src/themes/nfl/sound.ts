/** Synthesized stadium SFX (whistle, throw, catch, crowd) on top of the engine's synth. */
import { AudioEngine } from '../../engine/audio'
import type { SoundName, ThemeSounds } from '../../ui/theme'

const a = new AudioEngine()

function whistle(delay = 0, dur = 0.4) {
  a.tone({ freq: 2650, type: 'sine', dur, gain: 0.18, delay, vibrato: { rate: 38, depth: 160 } })
  a.tone({ freq: 2950, type: 'sine', dur, gain: 0.08, delay, vibrato: { rate: 38, depth: 160 } })
}

function crowd(intensity: number, dur: number, delay = 0) {
  a.noise({ dur, gain: 0.05 + 0.18 * intensity, delay, attack: dur * 0.25, release: dur * 0.5,
    filter: { type: 'bandpass', freq: 700 + 500 * intensity, q: 0.6 } })
  a.noise({ dur, gain: 0.03 + 0.08 * intensity, delay, attack: dur * 0.3, release: dur * 0.5,
    filter: { type: 'lowpass', freq: 400 } })
}

const NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5]

export const sounds: ThemeSounds = {
  unlock: () => a.unlock(),
  setMuted: (m) => a.setMuted(m),
  play(name: SoundName, opts = {}) {
    const tier = opts.tier ?? 1
    switch (name) {
      case 'click':
        a.tone({ freq: 1400, dur: 0.03, gain: 0.06, type: 'square' })
        break
      case 'start':
        whistle(0, 0.45)
        crowd(0.3, 1.2, 0.05)
        break
      case 'countdown':
        a.tone({ freq: 660, dur: 0.09, gain: 0.12 })
        break
      case 'go':
        whistle(0, 0.25)
        break
      case 'tick':
        a.tone({ freq: 1200, dur: 0.035, gain: 0.08, type: 'square' })
        break
      case 'wrong':
        a.tone({ freq: 160, freqEnd: 90, dur: 0.18, gain: 0.16, type: 'square' })
        a.noise({ dur: 0.08, gain: 0.12, filter: { type: 'lowpass', freq: 600 } })
        break
      case 'throw': {
        const d = 0.5 + tier * 0.25
        a.noise({ dur: d, gain: 0.14, attack: 0.02, release: d * 0.7, filter: { type: 'bandpass', freq: 500, freqEnd: 2400, q: 1.4 } })
        a.tone({ freq: 110, freqEnd: 70, dur: 0.12, gain: 0.2, type: 'sine' }) // snap thud
        break
      }
      case 'linePass': {
        const f = NOTES[Math.min(NOTES.length - 1, opts.index ?? 0)]
        a.tone({ freq: f, dur: 0.07, gain: 0.08, type: 'square' })
        a.tone({ freq: f * 1.5, dur: 0.07, gain: 0.05, type: 'square', delay: 0.05 })
        break
      }
      case 'land':
        a.tone({ freq: 140, freqEnd: 60, dur: 0.16, gain: 0.3, type: 'sine' })
        a.noise({ dur: 0.06, gain: 0.15, filter: { type: 'highpass', freq: 2000 } })
        crowd(Math.min(1, tier / 5), 0.8 + tier * 0.3)
        break
      case 'touchdown':
        crowd(1, 2.6)
        for (const [i, f] of [220, 277.2, 329.6].entries()) a.tone({ freq: f, dur: 0.9, gain: 0.07, type: 'sawtooth', delay: 0.05 * i })
        whistle(0.9, 0.3)
        break
      case 'reveal': {
        const n = tier ?? 1
        for (let i = 0; i < n + 1; i++) a.tone({ freq: NOTES[Math.min(4, i)] * (n >= 4 ? 1 : 0.5), dur: 0.12, gain: 0.07, type: 'square', delay: i * 0.07 })
        break
      }
      case 'miss': // sad trombone
        ;[392, 370, 349.2].forEach((f, i) => a.tone({ freq: f, dur: 0.32, gain: 0.1, type: 'sawtooth', delay: i * 0.34 }))
        a.tone({ freq: 329.6, dur: 0.9, gain: 0.1, type: 'sawtooth', delay: 1.02, vibrato: { rate: 6, depth: 8 } })
        break
      case 'end':
        whistle(0, 0.3)
        whistle(0.4, 0.3)
        whistle(0.8, 0.7)
        crowd(0.6, 2.2, 0.2)
        break
    }
  },
}
