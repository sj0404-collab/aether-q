export class BinReader {
  view: DataView
  offset = 0
  little = true

  constructor(public buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
  }

  get size() {
    return this.view.byteLength
  }

  seek(n: number) {
    this.offset = n
    return this
  }

  skip(n: number) {
    this.offset += n
    return this
  }

  u8() {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  u16() {
    const v = this.view.getUint16(this.offset, this.little)
    this.offset += 2
    return v
  }

  u32() {
    const v = this.view.getUint32(this.offset, this.little)
    this.offset += 4
    return v
  }

  i32() {
    const v = this.view.getInt32(this.offset, this.little)
    this.offset += 4
    return v
  }

  u64() {
    const lo = this.u32()
    const hi = this.u32()
    return hi * 0x100000000 + lo
  }

  peekU16(at = this.offset) {
    return this.view.getUint16(at, this.little)
  }

  peekU32(at = this.offset) {
    return this.view.getUint32(at, this.little)
  }

  bytes(n: number) {
    const slice = this.buffer.slice(this.offset, this.offset + n)
    this.offset += n
    return new Uint8Array(slice)
  }

  ascii(n: number) {
    const b = this.bytes(n)
    let s = ''
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0) break
      s += String.fromCharCode(b[i])
    }
    return s
  }

  cstring() {
    const start = this.offset
    while (this.offset < this.size && this.view.getUint8(this.offset) !== 0) this.offset++
    const s = this.asciiFrom(start, this.offset - start)
    this.offset += 1
    return s
  }

  asciiFrom(start: number, n: number) {
    const b = new Uint8Array(this.buffer, start, n)
    let s = ''
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0) break
      s += String.fromCharCode(b[i])
    }
    return s
  }

  utf8(n: number) {
    const b = this.bytes(n)
    return new TextDecoder('utf-8').decode(b)
  }
}

export function hexdump(bytes: Uint8Array, max = 256) {
  const n = Math.min(bytes.length, max)
  const lines: string[] = []
  for (let i = 0; i < n; i += 16) {
    const slice = bytes.subarray(i, Math.min(i + 16, n))
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ')
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('')
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`)
  }
  if (bytes.length > max) lines.push(`… ${bytes.length - max} more bytes`)
  return lines.join('\n')
}

export function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function printableStrings(data: Uint8Array, min = 4, limit = 400) {
  const out: string[] = []
  let buf = ''
  const push = () => {
    if (buf.length >= min && /[\p{L}\p{N}]/u.test(buf)) {
      out.push(buf)
    }
    buf = ''
  }
  for (let i = 0; i < data.length && out.length < limit; i++) {
    const b = data[i]
    if (b >= 32 && b < 127) buf += String.fromCharCode(b)
    else push()
  }
  push()
  return out
}
