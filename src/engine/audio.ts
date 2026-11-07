/**
 * Tiny Web Audio synth. Themes build their sound effects from tone() and noise().
 * The AudioContext is created on the first user gesture (unlock), as browsers require.
 */
export interface ToneOpts {
  freq: number
  freqEnd?: number
  type?: OscillatorType
  dur: number
  gain?: number
  delay?: number
  attack?: number
  release?: number
  vibrato?: { rate: number; depth: number }
}

export interface NoiseOpts {
  dur: number
  gain?: number
  delay?: number
  attack?: number
  release?: number
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  muted = false

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.6
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate * 2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02)
  }

  private ready(): AudioContext | null {
    return this.ctx && this.master && !this.muted ? this.ctx : null
  }

  private envelope(g: GainNode, t0: number, o: { dur: number; gain?: number; attack?: number; release?: number }) {
    const peak = o.gain ?? 0.3
    const a = o.attack ?? 0.005
    const r = o.release ?? Math.min(0.1, o.dur / 2)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + a)
    g.gain.setValueAtTime(peak, t0 + Math.max(a, o.dur - r))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  }

  tone(o: ToneOpts): void {
    const ctx = this.ready()
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = o.type ?? 'square'
    osc.frequency.setValueAtTime(o.freq, t0)
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur)
    if (o.vibrato) {
      const lfo = ctx.createOscillator()
      const lg = ctx.createGain()
      lfo.frequency.value = o.vibrato.rate
      lg.gain.value = o.vibrato.depth
      lfo.connect(lg).connect(osc.frequency)
      lfo.start(t0)
      lfo.stop(t0 + o.dur)
    }
    this.envelope(g, t0, o)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + o.dur + 0.05)
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ready()
    if (!ctx || !this.master || !this.noiseBuf) return
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const g = ctx.createGain()
    let node: AudioNode = src
    if (o.filter) {
      const f = ctx.createBiquadFilter()
      f.type = o.filter.type
      f.frequency.setValueAtTime(o.filter.freq, t0)
      if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, t0 + o.dur)
      f.Q.value = o.filter.q ?? 1
      node = src.connect(f)
    }
    this.envelope(g, t0, o)
    node.connect(g).connect(this.master)
    src.start(t0, Math.random())
    src.stop(t0 + o.dur + 0.05)
  }
}
