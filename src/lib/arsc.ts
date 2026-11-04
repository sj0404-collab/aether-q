import { BinReader } from './binary'

const RES_STRING_POOL = 0x0001
const RES_TABLE = 0x0002
const RES_TABLE_PACKAGE = 0x0200

function readUtf8Len(r: BinReader) {
  let u8 = r.u8()
  if (u8 & 0x80) u8 = ((u8 & 0x7f) << 8) | r.u8()
  return u8
}

function decodePool(r: BinReader, chunkStart: number, chunkSize: number) {
  const stringCount = r.u32()
  r.u32()
  const flags = r.u32()
  const stringsStart = r.u32()
  r.u32()
  const utf8 = (flags & 0x100) !== 0
  const offsets: number[] = []
  for (let i = 0; i < stringCount; i++) offsets.push(r.u32())
  const strings: string[] = []
  const poolBase = chunkStart + stringsStart
  for (let i = 0; i < stringCount; i++) {
    try {
      r.seek(poolBase + offsets[i])
      if (utf8) {
        readUtf8Len(r)
        const byteLen = readUtf8Len(r)
        strings.push(new TextDecoder('utf-8').decode(r.bytes(byteLen)))
      } else {
        let charCount = r.u16()
        if (charCount & 0x8000) charCount = ((charCount & 0x7fff) << 16) | r.u16()
        let s = ''
        for (let c = 0; c < charCount; c++) {
          const ch = r.u16()
          if (!ch) break
          s += String.fromCharCode(ch)
        }
        strings.push(s)
      }
    } catch {
      strings.push('')
    }
  }
  r.seek(chunkStart + chunkSize)
  return strings
}

export type ArscTable = {
  globalStrings: string[]
  packages: { id: number; name: string; typeStrings: string[]; keyStrings: string[] }[]
  values: Record<string, string>
}

export function parseArsc(buffer: ArrayBuffer): ArscTable {
  const r = new BinReader(buffer)
  const type = r.u16()
  const headerSize = r.u16()
  const fileSize = r.u32()
  if (type !== RES_TABLE) {
    return { globalStrings: [], packages: [], values: {} }
  }
  r.u32() // package count
  r.seek(headerSize)

  const table: ArscTable = { globalStrings: [], packages: [], values: {} }
  const end = Math.min(fileSize, r.size)

  while (r.offset + 8 <= end) {
    const start = r.offset
    const t = r.u16()
    const hs = r.u16()
    const size = r.u32()
    if (size < 8 || start + size > r.size) break

    if (t === RES_STRING_POOL) {
      r.seek(start + 8)
      if (!table.globalStrings.length) table.globalStrings = decodePool(r, start, size)
      else r.seek(start + size)
      continue
    }
    if (t === RES_TABLE_PACKAGE) {
      const id = r.u32()
      let name = ''
      for (let i = 0; i < 128; i++) {
        const ch = r.u16()
        if (ch) name += String.fromCharCode(ch)
      }
      const typeStringsOff = r.u32()
      r.u32()
      const keyStringsOff = r.u32()
      let typeStrings: string[] = []
      let keyStrings: string[] = []
      try {
        r.seek(start + typeStringsOff)
        const tt = r.u16()
        r.u16()
        const ts = r.u32()
        if (tt === RES_STRING_POOL) {
          r.seek(start + typeStringsOff + 8)
          typeStrings = decodePool(r, start + typeStringsOff, ts)
        }
      } catch {
        /* ignore */
      }
      try {
        r.seek(start + keyStringsOff)
        const tt = r.u16()
        r.u16()
        const ts = r.u32()
        if (tt === RES_STRING_POOL) {
          r.seek(start + keyStringsOff + 8)
          keyStrings = decodePool(r, start + keyStringsOff, ts)
        }
      } catch {
        /* ignore */
      }
      table.packages.push({ id, name, typeStrings, keyStrings })
      r.seek(start + size)
      void hs
      continue
    }
    r.seek(start + size)
  }

  const values: Record<string, string> = {}
  for (const s of table.globalStrings) {
    if (s && s.length < 80 && /[\p{L}]/u.test(s) && !s.includes('/') && !s.includes('.')) {
      // keep later
    }
  }
  for (const pkg of table.packages) {
    for (let i = 0; i < pkg.keyStrings.length; i++) {
      const k = pkg.keyStrings[i]
      if (!k) continue
      const guess = table.globalStrings.find((s) => s && s.length < 64 && s.length > 0)
      if (guess && !values[k]) values[k] = guess
    }
  }
  table.values = values
  return table
}

export function lookupLabel(arsc: ArscTable, ref: string, fallback: string) {
  if (!ref) return fallback
  if (!ref.startsWith('@')) return ref
  const keys = ['app_name', 'appName', 'application_name', 'title', 'launcher_name']
  for (const k of keys) {
    const hit = arsc.packages.flatMap((p) => p.keyStrings).includes(k)
    if (hit) {
      const idx = arsc.globalStrings.findIndex((s) => s && s.length > 1 && s.length < 48 && /[\p{L}]/u.test(s) && !s.includes('http'))
      if (idx >= 0) return arsc.globalStrings[idx]
    }
  }
  const named = arsc.globalStrings.filter(
    (s) => s && s.length >= 2 && s.length <= 40 && /[\p{L}]/u.test(s) && !s.includes('/') && !s.includes('android') && !s.includes('http'),
  )
  return named[0] || fallback
}
