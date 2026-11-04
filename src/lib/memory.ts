import type { MemOps } from './arm64'

export class GuestMemory implements MemOps {
  pages = new Map<number, Uint8Array>()
  pageSize = 0x1000
  brk = 0x40000000n
  heapEnd = 0x40000000n
  faults = 0
  lastFault = 0n

  private page(addr: bigint, write = false) {
    const a = Number(addr & 0xffffffffffffn)
    const idx = Math.floor(a / this.pageSize)
    let p = this.pages.get(idx)
    if (!p) {
      if (!write) {
        this.faults++
        this.lastFault = addr
        p = new Uint8Array(this.pageSize)
        this.pages.set(idx, p)
      } else {
        p = new Uint8Array(this.pageSize)
        this.pages.set(idx, p)
      }
    }
    return { p, off: a % this.pageSize }
  }

  mapBytes(addr: bigint, data: Uint8Array) {
    for (let i = 0; i < data.length; ) {
      const { p, off } = this.page(addr + BigInt(i), true)
      const n = Math.min(this.pageSize - off, data.length - i)
      p.set(data.subarray(i, i + n), off)
      i += n
    }
  }

  readBytes(addr: bigint, n: number) {
    const out = new Uint8Array(n)
    for (let i = 0; i < n; i++) out[i] = this.r8(addr + BigInt(i))
    return out
  }

  readCString(addr: bigint, max = 4096) {
    let s = ''
    for (let i = 0; i < max; i++) {
      const b = this.r8(addr + BigInt(i))
      if (!b) break
      s += String.fromCharCode(b)
    }
    return s
  }

  writeCString(addr: bigint, s: string) {
    const enc = new TextEncoder().encode(s)
    this.mapBytes(addr, enc)
    this.w8(addr + BigInt(enc.length), 0)
    return enc.length + 1
  }

  r8(addr: bigint) {
    const { p, off } = this.page(addr)
    return p[off]
  }
  r16(addr: bigint) {
    return this.r8(addr) | (this.r8(addr + 1n) << 8)
  }
  r32(addr: bigint) {
    return (
      this.r8(addr) |
      (this.r8(addr + 1n) << 8) |
      (this.r8(addr + 2n) << 16) |
      (this.r8(addr + 3n) << 24)
    ) >>> 0
  }
  r64(addr: bigint) {
    const lo = BigInt(this.r32(addr))
    const hi = BigInt(this.r32(addr + 4n))
    return lo | (hi << 32n)
  }
  w8(addr: bigint, v: number) {
    const { p, off } = this.page(addr, true)
    p[off] = v & 0xff
  }
  w16(addr: bigint, v: number) {
    this.w8(addr, v)
    this.w8(addr + 1n, v >> 8)
  }
  w32(addr: bigint, v: number) {
    this.w8(addr, v)
    this.w8(addr + 1n, v >> 8)
    this.w8(addr + 2n, v >> 16)
    this.w8(addr + 3n, v >> 24)
  }
  w64(addr: bigint, v: bigint) {
    this.w32(addr, Number(v & 0xffffffffn))
    this.w32(addr + 4n, Number((v >> 32n) & 0xffffffffn))
  }

  mmap(size: number, hint = 0n) {
    const align = 0x1000n
    let addr = hint && hint !== 0n ? hint : this.heapEnd
    if (addr % align) addr += align - (addr % align)
    const n = Math.max(this.pageSize, size)
    this.mapBytes(addr, new Uint8Array(n))
    const end = addr + BigInt(n)
    if (end > this.heapEnd) this.heapEnd = end
    return addr
  }
}
