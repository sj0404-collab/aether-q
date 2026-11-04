export type TtsEvent = {
  at: number
  text: string
  lang: string
  rate: number
  pitch: number
}

class TtsEngine {
  enabled = true
  rate = 1
  pitch = 1
  volume = 1
  lang = 'en-US'
  history: TtsEvent[] = []
  speaking = false
  voices: SpeechSynthesisVoice[] = []

  refreshVoices() {
    if (typeof speechSynthesis === 'undefined') return
    this.voices = speechSynthesis.getVoices()
  }

  pickVoice(lang = this.lang) {
    this.refreshVoices()
    const short = lang.slice(0, 2)
    return (
      this.voices.find((v) => v.lang === lang) ||
      this.voices.find((v) => v.lang.startsWith(short)) ||
      this.voices.find((v) => v.default) ||
      this.voices[0] ||
      null
    )
  }

  speak(text: string, opts?: { lang?: string; rate?: number; pitch?: number; interrupt?: boolean }) {
    if (!this.enabled || !text.trim()) return false
    if (typeof speechSynthesis === 'undefined') return false
    if (opts?.interrupt !== false) speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = opts?.lang ?? this.lang
    u.rate = opts?.rate ?? this.rate
    u.pitch = opts?.pitch ?? this.pitch
    u.volume = this.volume
    const voice = this.pickVoice(u.lang)
    if (voice) u.voice = voice
    u.onstart = () => {
      this.speaking = true
    }
    u.onend = () => {
      this.speaking = false
    }
    u.onerror = () => {
      this.speaking = false
    }
    this.history.unshift({
      at: Date.now(),
      text,
      lang: u.lang,
      rate: u.rate,
      pitch: u.pitch,
    })
    if (this.history.length > 80) this.history.length = 80
    speechSynthesis.speak(u)
    return true
  }

  stop() {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    this.speaking = false
  }

  pause() {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.pause()
  }

  resume() {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.resume()
  }
}

export const tts = new TtsEngine()

if (typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', () => tts.refreshVoices())
  tts.refreshVoices()
}
