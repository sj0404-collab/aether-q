export type HttpRecord = {
  id: string
  at: number
  method: string
  url: string
  status: number
  ok: boolean
  ms: number
  bytes: number
  contentType: string
  bodyPreview: string
  error?: string
}

export type NetState = {
  online: boolean
  type: 'WIFI' | 'MOBILE' | 'NONE'
  ssid: string
  ip: string
  dns: string[]
  gateway: string
}

const corsProxies = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

export class NetworkStack {
  state: NetState = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    type: 'WIFI',
    ssid: 'Aether-Lab-5G',
    ip: '10.0.2.15',
    dns: ['8.8.8.8', '8.8.4.4'],
    gateway: '10.0.2.2',
  }
  log: HttpRecord[] = []
  listeners: Array<(r: HttpRecord) => void> = []

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.state.online = true
        this.state.type = 'WIFI'
      })
      window.addEventListener('offline', () => {
        this.state.online = false
        this.state.type = 'NONE'
      })
    }
  }

  onRequest(fn: (r: HttpRecord) => void) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn)
    }
  }

  private emit(r: HttpRecord) {
    this.log.unshift(r)
    if (this.log.length > 200) this.log.length = 200
    this.listeners.forEach((f) => f(r))
  }

  async fetch(url: string, init?: RequestInit & { viaProxy?: boolean }): Promise<{ record: HttpRecord; text: string; headers: Record<string, string> }> {
    const started = performance.now()
    const method = (init?.method || 'GET').toUpperCase()
    const id = Math.random().toString(36).slice(2, 10)
    const tryUrls = init?.viaProxy === false ? [url] : [url, ...corsProxies.map((p) => p(url))]
    let lastErr = ''
    for (const u of tryUrls) {
      try {
        const res = await fetch(u, {
          ...init,
          method,
        })
        const buf = await res.arrayBuffer()
        const text = new TextDecoder().decode(buf.slice(0, 200_000))
        const headers: Record<string, string> = {}
        res.headers.forEach((v, k) => {
          headers[k] = v
        })
        const rec: HttpRecord = {
          id,
          at: Date.now(),
          method,
          url,
          status: res.status,
          ok: res.ok,
          ms: Math.round(performance.now() - started),
          bytes: buf.byteLength,
          contentType: res.headers.get('content-type') || '',
          bodyPreview: text.slice(0, 4000),
        }
        this.emit(rec)
        return { record: rec, text, headers }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
    }
    const rec: HttpRecord = {
      id,
      at: Date.now(),
      method,
      url,
      status: 0,
      ok: false,
      ms: Math.round(performance.now() - started),
      bytes: 0,
      contentType: '',
      bodyPreview: '',
      error: lastErr || 'network error',
    }
    this.emit(rec)
    throw new Error(rec.error)
  }

  async ping(host = 'https://www.google.com/generate_204') {
    const t0 = performance.now()
    try {
      await fetch(host, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      return { ok: true, ms: Math.round(performance.now() - t0) }
    } catch {
      return { ok: false, ms: Math.round(performance.now() - t0) }
    }
  }
}

export const net = new NetworkStack()
