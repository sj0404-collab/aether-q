export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S'

export type LogLine = {
  ts: number
  pid: number
  tid: number
  level: LogLevel
  tag: string
  msg: string
}

const COLORS: Record<LogLevel, string> = {
  V: '#8b93a7',
  D: '#7dd3fc',
  I: '#86efac',
  W: '#fbbf24',
  E: '#f87171',
  F: '#fb7185',
  S: '#c4b5fd',
}

export class Logcat {
  lines: LogLine[] = []
  listeners: Array<(l: LogLine) => void> = []
  pidSeq = 1000
  paused = false
  bufferSize = 4000

  on(fn: (l: LogLine) => void) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn)
    }
  }

  nextPid() {
    this.pidSeq += 1
    return this.pidSeq
  }

  write(level: LogLevel, tag: string, msg: string, pid = 1234, tid = 1234) {
    const line: LogLine = { ts: Date.now(), pid, tid, level, tag, msg }
    if (!this.paused) {
      this.lines.push(line)
      if (this.lines.length > this.bufferSize) this.lines.splice(0, this.lines.length - this.bufferSize)
      this.listeners.forEach((f) => f(line))
    }
    return line
  }

  v(tag: string, msg: string, pid?: number) {
    return this.write('V', tag, msg, pid)
  }
  d(tag: string, msg: string, pid?: number) {
    return this.write('D', tag, msg, pid)
  }
  i(tag: string, msg: string, pid?: number) {
    return this.write('I', tag, msg, pid)
  }
  w(tag: string, msg: string, pid?: number) {
    return this.write('W', tag, msg, pid)
  }
  e(tag: string, msg: string, pid?: number) {
    return this.write('E', tag, msg, pid)
  }

  format(l: LogLine) {
    const d = new Date(l.ts)
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
    return `${t} ${String(l.pid).padStart(5)} ${String(l.tid).padStart(5)} ${l.level} ${l.tag}: ${l.msg}`
  }

  dump(filter?: string) {
    const f = filter?.toLowerCase()
    return this.lines
      .filter((l) => !f || this.format(l).toLowerCase().includes(f))
      .map((l) => this.format(l))
      .join('\n')
  }

  clear() {
    this.lines = []
  }

  color(level: LogLevel) {
    return COLORS[level]
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export const logcat = new Logcat()
