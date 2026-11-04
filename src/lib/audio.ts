export type ToneSpec = {
  freq: number
  dur: number
  type?: OscillatorType
  gain?: number
  slideTo?: number
  noise?: boolean
}

export class AudioEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  muted = false
  volume = 0.7
  unlocked = false

  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : this.volume
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.unlocked = true
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : this.volume
  }

  private env(duration: number, peak: number) {
    if (!this.ctx || !this.master) return null
    const g = this.ctx.createGain()
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    g.connect(this.master)
    return g
  }

  tone(spec: ToneSpec) {
    if (!this.ctx || !this.master || this.muted) return
    const t = this.ctx.currentTime
    const dur = spec.dur
    const g = this.env(dur, spec.gain ?? 0.18)
    if (!g) return
    if (spec.noise) {
      const n = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate)
      const d = n.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const src = this.ctx.createBufferSource()
      src.buffer = n
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = spec.freq
      src.connect(bp)
      bp.connect(g)
      src.start(t)
      src.stop(t + dur)
      return
    }
    const o = this.ctx.createOscillator()
    o.type = spec.type ?? 'sine'
    o.frequency.setValueAtTime(spec.freq, t)
    if (spec.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, spec.slideTo), t + dur)
    o.connect(g)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  sequence(notes: ToneSpec[], gap = 0.02) {
    let t = 0
    notes.forEach((n) => {
      window.setTimeout(() => this.tone(n), t * 1000)
      t += n.dur + gap
    })
  }

  bootChime() {
    this.sequence([
      { freq: 392, dur: 0.12, type: 'triangle', gain: 0.12 },
      { freq: 523.25, dur: 0.14, type: 'triangle', gain: 0.14 },
      { freq: 659.25, dur: 0.22, type: 'sine', gain: 0.16 },
      { freq: 784, dur: 0.32, type: 'sine', gain: 0.1, slideTo: 880 },
    ])
  }

  unlockChime() {
    this.sequence([
      { freq: 660, dur: 0.07, type: 'sine', gain: 0.1 },
      { freq: 880, dur: 0.12, type: 'sine', gain: 0.12 },
    ])
  }

  tap() {
    this.tone({ freq: 1800, dur: 0.03, type: 'triangle', gain: 0.05 })
  }

  key() {
    this.tone({ freq: 1400, dur: 0.04, type: 'square', gain: 0.03 })
  }

  back() {
    this.tone({ freq: 420, dur: 0.08, type: 'triangle', gain: 0.08, slideTo: 280 })
  }

  notify() {
    this.sequence([
      { freq: 880, dur: 0.08, type: 'sine', gain: 0.12 },
      { freq: 1174, dur: 0.16, type: 'sine', gain: 0.14 },
    ])
  }

  ringtone(loops = 2) {
    const once: ToneSpec[] = [
      { freq: 440, dur: 0.18, type: 'sine', gain: 0.14 },
      { freq: 554, dur: 0.18, type: 'sine', gain: 0.14 },
      { freq: 659, dur: 0.28, type: 'sine', gain: 0.16 },
      { freq: 554, dur: 0.18, type: 'sine', gain: 0.12 },
    ]
    const seq: ToneSpec[] = []
    for (let i = 0; i < loops; i++) seq.push(...once)
    this.sequence(seq, 0.05)
  }

  cameraShutter() {
    this.tone({ freq: 2400, dur: 0.04, type: 'square', gain: 0.08, noise: false })
    window.setTimeout(() => this.tone({ freq: 900, dur: 0.08, noise: true, gain: 0.1 }), 40)
  }

  error() {
    this.sequence([
      { freq: 220, dur: 0.12, type: 'sawtooth', gain: 0.1 },
      { freq: 180, dur: 0.18, type: 'sawtooth', gain: 0.12 },
    ])
  }

  installOk() {
    this.sequence([
      { freq: 523, dur: 0.08, type: 'triangle', gain: 0.1 },
      { freq: 784, dur: 0.16, type: 'triangle', gain: 0.14 },
    ])
  }

  alarm() {
    this.sequence(
      Array.from({ length: 6 }, (_, i) => ({
        freq: i % 2 === 0 ? 880 : 660,
        dur: 0.18,
        type: 'square' as OscillatorType,
        gain: 0.1,
      })),
      0.04,
    )
  }
}

export const audio = new AudioEngine()
