export const REG = {
  X0: 0, X1: 1, X2: 2, X3: 3, X4: 4, X5: 5, X6: 6, X7: 7,
  X8: 8, X9: 9, X10: 10, X11: 11, X12: 12, X13: 13, X14: 14, X15: 15,
  X16: 16, X17: 17, X18: 18, X19: 19, X20: 20, X21: 21, X22: 22, X23: 23,
  X24: 24, X25: 25, X26: 26, X27: 27, X28: 28, FP: 29, LR: 30, SP: 31,
} as const

export type CpuState = {
  x: BigUint64Array
  sp: bigint
  pc: bigint
  nzcv: number
  halted: boolean
  exitCode: number
  steps: number
  lastInst: number
  lastDecoded: string
}

export function createCpu(pc = 0n, sp = 0n): CpuState {
  const x = new BigUint64Array(32)
  return { x, sp, pc, nzcv: 0, halted: false, exitCode: 0, steps: 0, lastInst: 0, lastDecoded: '' }
}

const MASK64 = 0xffffffffffffffffn
const MASK32 = 0xffffffffn

export function u64(n: bigint) {
  return n & MASK64
}

export function s64(n: bigint) {
  const v = n & MASK64
  return v >= 0x8000000000000000n ? v - 0x10000000000000000n : v
}

function bit(w: number, lo: number, hi: number) {
  return (w >>> lo) & ((1 << (hi - lo + 1)) - 1)
}

function sign(v: number, bits: number) {
  const m = 1 << (bits - 1)
  return (v ^ m) - m
}

function addWithFlags(a: bigint, b: bigint, sf: boolean) {
  if (!sf) {
    const aa = Number(a & MASK32)
    const bb = Number(b & MASK32)
    const r = (aa + bb) >>> 0
    const n = (r >>> 31) & 1
    const z = r === 0 ? 1 : 0
    const c = aa + bb > 0xffffffff ? 1 : 0
    const o = ((aa ^ r) & (bb ^ r) & 0x80000000) !== 0 ? 1 : 0
    return { r: BigInt(r), nzcv: (n << 3) | (z << 2) | (c << 1) | o }
  }
  const r = u64(a + b)
  const n = r >> 63n === 1n ? 1 : 0
  const z = r === 0n ? 1 : 0
  const c = a + b > MASK64 ? 1 : 0
  const as = s64(a)
  const bs = s64(b)
  const rs = s64(r)
  const o = (as > 0n && bs > 0n && rs < 0n) || (as < 0n && bs < 0n && rs >= 0n) ? 1 : 0
  return { r, nzcv: (n << 3) | (z << 2) | (c << 1) | o }
}

function condHold(nzcv: number, cond: number) {
  const n = (nzcv >> 3) & 1
  const z = (nzcv >> 2) & 1
  const c = (nzcv >> 1) & 1
  const v = nzcv & 1
  let r = false
  switch (cond >>> 1) {
    case 0:
      r = z === 1
      break
    case 1:
      r = c === 1
      break
    case 2:
      r = n === 1
      break
    case 3:
      r = v === 1
      break
    case 4:
      r = c === 1 && z === 0
      break
    case 5:
      r = n === v
      break
    case 6:
      r = n === v && z === 0
      break
    case 7:
      r = true
      break
  }
  if (cond & 1 && cond !== 15) r = !r
  return r
}

export type MemOps = {
  r8: (addr: bigint) => number
  r16: (addr: bigint) => number
  r32: (addr: bigint) => number
  r64: (addr: bigint) => bigint
  w8: (addr: bigint, v: number) => void
  w16: (addr: bigint, v: number) => void
  w32: (addr: bigint, v: number) => void
  w64: (addr: bigint, v: bigint) => void
}

export type Syscall = (cpu: CpuState, mem: MemOps) => void

function xn(cpu: CpuState, i: number, sf = true) {
  if (i === 31) return sf ? cpu.sp : 0n
  return sf ? cpu.x[i] : cpu.x[i] & MASK32
}

function setXn(cpu: CpuState, i: number, v: bigint, sf = true) {
  if (i === 31) {
    if (sf) cpu.sp = u64(v)
    return
  }
  cpu.x[i] = sf ? u64(v) : (cpu.x[i] & 0xffffffff00000000n) | (v & MASK32)
}

function decodeDpImm(cpu: CpuState, w: number): string | null {
  const op0 = bit(w, 23, 25)
  const sf = bit(w, 31, 31) === 1
  const rd = bit(w, 0, 4)
  const rn = bit(w, 5, 9)
  if (bit(w, 24, 28) === 0x10) {
    // ADR / ADRP
    const op = bit(w, 31, 31)
    const immlo = bit(w, 29, 30)
    const immhi = bit(w, 5, 23)
    let imm = sign((immhi << 2) | immlo, 21)
    if (op) {
      imm <<= 12
      const page = cpu.pc & ~0xfffn
      setXn(cpu, rd, page + BigInt(imm))
      return `adrp x${rd}, ${imm}`
    }
    setXn(cpu, rd, cpu.pc + BigInt(imm))
    return `adr x${rd}, ${imm}`
  }
  if (bit(w, 23, 28) === 0x22 || bit(w, 23, 28) === 0x32) {
    // add/sub immediate
    const op = bit(w, 30, 30)
    const s = bit(w, 29, 29)
    const sh = bit(w, 22, 22)
    let imm = bit(w, 10, 21)
    if (sh) imm <<= 12
    const a = xn(cpu, rn, sf)
    const b = BigInt(imm)
    const { r, nzcv } = op ? addWithFlags(a, u64(-b), sf) : addWithFlags(a, b, sf)
    if (s) cpu.nzcv = nzcv
    setXn(cpu, rd, r, sf)
    return `${op ? 'sub' : 'add'}${s ? 's' : ''} ${sf ? 'x' : 'w'}${rd}, ${sf ? 'x' : 'w'}${rn}, #${imm}`
  }
  if (bit(w, 23, 28) === 0x24 || bit(w, 23, 28) === 0x25) {
    // logic immediate — approximate via decode of N,immr,imms
    const opc = bit(w, 29, 30)
    const N = bit(w, 22, 22)
    const immr = bit(w, 16, 21)
    const imms = bit(w, 10, 15)
    const imm = decodeBitmask(N, immr, imms, sf)
    const a = xn(cpu, rn, sf)
    let r = 0n
    if (opc === 0) r = a & imm
    else if (opc === 1) r = a | imm
    else if (opc === 2) r = a ^ imm
    else r = a & imm
    setXn(cpu, rd, r, sf)
    if (opc === 3) cpu.nzcv = (Number((r >> (sf ? 63n : 31n)) & 1n) << 3) | (r === 0n ? 4 : 0)
    return `logic-imm ${sf ? 'x' : 'w'}${rd}`
  }
  if (bit(w, 23, 28) === 0x25 && op0) {
    /* fallthrough */
  }
  if (bit(w, 23, 28) === 0x12 || bit(w, 23, 28) === 0x32 || (bit(w, 23, 28) & 0x3e) === 0x12) {
    /* already handled */
  }
  if (bit(w, 23, 28) === 0x25) return null
  if ((w & 0x1f800000) === 0x12800000 || (w & 0x1f800000) === 0x52800000 || (w & 0x1f800000) === 0x72800000 || (w & 0x1f800000) === 0x32800000) {
    const opc = bit(w, 29, 30)
    const hw = bit(w, 21, 22)
    const imm16 = bit(w, 5, 20)
    const shift = hw * 16
    const imm = BigInt(imm16) << BigInt(shift)
    let r = xn(cpu, rd, sf)
    if (opc === 0) r = u64(~imm) // movn
    else if (opc === 2) r = imm // movz
    else if (opc === 3) r = (r & u64(~(0xffffn << BigInt(shift)))) | imm // movk
    setXn(cpu, rd, r, sf)
    const names = ['movn', '?', 'movz', 'movk']
    return `${names[opc]} ${sf ? 'x' : 'w'}${rd}, #${imm16}, lsl #${shift}`
  }
  return null
}

function decodeBitmask(N: number, immr: number, imms: number, sf: boolean): bigint {
  const len = 31 - Math.clz32((N << 6) | (~imms & 0x3f))
  if (len < 1) return 0n
  const size = 1 << len
  const r = immr & (size - 1)
  const s = imms & (size - 1)
  let welem = (1n << BigInt(s + 1)) - 1n
  const rot = (welem >> BigInt(r)) | (welem << BigInt(size - r))
  welem = rot & ((1n << BigInt(size)) - 1n)
  let out = 0n
  const bits = sf ? 64 : 32
  for (let i = 0; i < bits; i += size) out |= welem << BigInt(i)
  return sf ? out & MASK64 : out & MASK32
}

function decodeBranch(cpu: CpuState, w: number, mem: MemOps, svc: Syscall): string | null {
  if ((w & 0xfc000000) === 0x14000000 || (w & 0xfc000000) === 0x94000000) {
    const imm26 = sign(w & 0x03ffffff, 26)
    const target = cpu.pc + BigInt(imm26 * 4)
    if ((w & 0x80000000) !== 0) setXn(cpu, 30, cpu.pc + 4n)
    cpu.pc = u64(target - 4n)
    return (w & 0x80000000) !== 0 ? `bl ${target.toString(16)}` : `b ${target.toString(16)}`
  }
  if ((w & 0xff000010) === 0x54000000) {
    const imm19 = sign(bit(w, 5, 23), 19)
    const cond = bit(w, 0, 3)
    if (condHold(cpu.nzcv, cond)) cpu.pc = u64(cpu.pc + BigInt(imm19 * 4) - 4n)
    return `b.cond ${cond}`
  }
  if ((w & 0x7e000000) === 0x34000000) {
    const sf = bit(w, 31, 31) === 1
    const op = bit(w, 24, 24)
    const imm19 = sign(bit(w, 5, 23), 19)
    const rt = bit(w, 0, 4)
    const v = xn(cpu, rt, sf)
    const isZero = v === 0n
    if ((op === 0 && isZero) || (op === 1 && !isZero)) cpu.pc = u64(cpu.pc + BigInt(imm19 * 4) - 4n)
    return op ? 'cbnz' : 'cbz'
  }
  if ((w & 0xfe000000) === 0xd6000000) {
    const op = bit(w, 21, 22)
    const rn = bit(w, 5, 9)
    const opc = bit(w, 0, 4)
    if (op === 0 && opc === 0) {
      cpu.pc = u64(xn(cpu, rn) - 4n)
      return `br x${rn}`
    }
    if (op === 1 && opc === 0) {
      setXn(cpu, 30, cpu.pc + 4n)
      cpu.pc = u64(xn(cpu, rn) - 4n)
      return `blr x${rn}`
    }
    if (op === 2 && opc === 0) {
      cpu.pc = u64(cpu.x[30] - 4n)
      return 'ret'
    }
    return 'br-group'
  }
  if ((w & 0xffe0001f) === 0xd4000001) {
    svc(cpu, mem)
    return `svc #${bit(w, 5, 20)}`
  }
  if (w === 0xd503201f) return 'nop'
  if ((w & 0xfff00000) === 0xd5300000 || (w & 0xfff00000) === 0xd5100000) {
    return 'mrs/msr'
  }
  if (w === 0xd65f03c0) {
    cpu.pc = u64(cpu.x[30] - 4n)
    return 'ret'
  }
  return null
}

function decodeLdst(cpu: CpuState, w: number, mem: MemOps): string | null {
  const size = bit(w, 30, 31)
  const v = bit(w, 26, 26)
  if (v) return null
  const opc = bit(w, 22, 23)
  const rt = bit(w, 0, 4)
  const rn = bit(w, 5, 9)
  const sf = size === 3
  // unsigned offset 111001
  if ((w & 0x3b000000) === 0x39000000) {
    const imm12 = bit(w, 10, 21)
    const scale = size
    const off = BigInt(imm12 << scale)
    const addr = xn(cpu, rn) + off
    const isLoad = (opc & 1) === 1 || opc === 2
    if (!isLoad) {
      if (size === 0) mem.w8(addr, Number(xn(cpu, rt) & 0xffn))
      else if (size === 1) mem.w16(addr, Number(xn(cpu, rt) & 0xffffn))
      else if (size === 2) mem.w32(addr, Number(xn(cpu, rt) & MASK32))
      else mem.w64(addr, xn(cpu, rt))
      return `str ${sf ? 'x' : 'w'}${rt}, [x${rn}, #${off}]`
    }
    let val = 0n
    if (size === 0) val = BigInt(mem.r8(addr))
    else if (size === 1) val = BigInt(mem.r16(addr))
    else if (size === 2) val = BigInt(mem.r32(addr) >>> 0)
    else val = mem.r64(addr)
    setXn(cpu, rt, val, size === 3)
    if (size < 3) setXn(cpu, rt, val, false)
    return `ldr ${size === 3 ? 'x' : 'w'}${rt}, [x${rn}, #${off}]`
  }
  // immediate pre/post 111000
  if ((w & 0x3b200000) === 0x38000000) {
    const imm9 = sign(bit(w, 12, 20), 9)
    const addrBase = xn(cpu, rn)
    const wback = bit(w, 11, 11) === 1 || bit(w, 10, 10) === 1
    const pre = bit(w, 11, 11) === 1
    const addr = pre ? addrBase + BigInt(imm9) : addrBase
    const isLoad = bit(w, 22, 22) === 1
    if (isLoad) {
      let val = 0n
      if (size === 0) val = BigInt(mem.r8(addr))
      else if (size === 1) val = BigInt(mem.r16(addr))
      else if (size === 2) val = BigInt(mem.r32(addr) >>> 0)
      else val = mem.r64(addr)
      setXn(cpu, rt, val, size === 3)
      if (size < 3) setXn(cpu, rt, val, false)
    } else {
      if (size === 0) mem.w8(addr, Number(xn(cpu, rt) & 0xffn))
      else if (size === 1) mem.w16(addr, Number(xn(cpu, rt) & 0xffffn))
      else if (size === 2) mem.w32(addr, Number(xn(cpu, rt) & MASK32))
      else mem.w64(addr, xn(cpu, rt))
    }
    if (wback) setXn(cpu, rn, addrBase + BigInt(imm9))
    return isLoad ? 'ldr-imm' : 'str-imm'
  }
  // pair stp/ldp
  if ((w & 0x3a000000) === 0x28000000) {
    const opc2 = bit(w, 30, 31)
    const is64 = opc2 === 2
    const imm7 = sign(bit(w, 15, 21), 7)
    const rt2 = bit(w, 10, 14)
    const scale = is64 ? 8 : 4
    const off = BigInt(imm7 * scale)
    const pre = bit(w, 24, 24) === 1
    const wback = bit(w, 23, 23) === 1 || pre
    const load = bit(w, 22, 22) === 1
    const base = xn(cpu, rn)
    const addr = (pre || bit(w, 24, 24) === 1 ? base + off : base + (bit(w, 23, 24) === 2 ? off : bit(w, 24, 24) === 0 ? 0n : off))
    const a = bit(w, 23, 24)
    const address = a === 1 ? base : a === 3 ? base + off : base + off
    if (load) {
      if (is64) {
        setXn(cpu, rt, mem.r64(address))
        setXn(cpu, rt2, mem.r64(address + 8n))
      } else {
        setXn(cpu, rt, BigInt(mem.r32(address)), false)
        setXn(cpu, rt2, BigInt(mem.r32(address + 4n)), false)
      }
    } else {
      if (is64) {
        mem.w64(address, xn(cpu, rt))
        mem.w64(address + 8n, xn(cpu, rt2))
      } else {
        mem.w32(address, Number(xn(cpu, rt) & MASK32))
        mem.w32(address + 4n, Number(xn(cpu, rt2) & MASK32))
      }
    }
    if (wback && a !== 2) setXn(cpu, rn, base + off)
    void off
    return load ? 'ldp' : 'stp'
  }
  // literal ldr
  if ((w & 0x3b000000) === 0x18000000) {
    const imm19 = sign(bit(w, 5, 23), 19)
    const addr = cpu.pc + BigInt(imm19 * 4)
    if (opc === 0) setXn(cpu, rt, BigInt(mem.r32(addr)), false)
    else setXn(cpu, rt, mem.r64(addr))
    return 'ldr-literal'
  }
  return null
}

function decodeDpReg(cpu: CpuState, w: number): string | null {
  const sf = bit(w, 31, 31) === 1
  const rd = bit(w, 0, 4)
  const rn = bit(w, 5, 9)
  const rm = bit(w, 16, 20)
  if ((w & 0x1f200000) === 0x0b000000) {
    const op = bit(w, 30, 30)
    const s = bit(w, 29, 29)
    const a = xn(cpu, rn, sf)
    const b = xn(cpu, rm, sf)
    const { r, nzcv } = op ? addWithFlags(a, u64(-b), sf) : addWithFlags(a, b, sf)
    if (s) cpu.nzcv = nzcv
    setXn(cpu, rd, r, sf)
    return `${op ? 'sub' : 'add'}${s ? 's' : ''} reg`
  }
  if ((w & 0x1f000000) === 0x0a000000) {
    const opc = bit(w, 29, 30)
    const a = xn(cpu, rn, sf)
    const b = xn(cpu, rm, sf)
    let r = 0n
    if (opc === 0) r = a & b
    else if (opc === 1) r = a | b
    else if (opc === 2) r = a ^ b
    else r = a & b
    setXn(cpu, rd, r, sf)
    return 'logic-reg'
  }
  if ((w & 0x1f200000) === 0x1b000000) {
    const ra = bit(w, 10, 14)
    const a = xn(cpu, rn, sf)
    const b = xn(cpu, rm, sf)
    const acc = xn(cpu, ra, sf)
    const op31 = bit(w, 15, 15)
    const prod = u64(a * b)
    const r = op31 ? u64(acc - prod) : u64(acc + prod)
    setXn(cpu, rd, r, sf)
    return op31 ? 'msub' : 'madd'
  }
  if ((w & 0x3fe00000) === 0x1ac00000) {
    const opcode = bit(w, 10, 15)
    const a = xn(cpu, rn, sf)
    const b = xn(cpu, rm, sf)
    const sh = Number(b & (sf ? 63n : 31n))
    let r = a
    if (opcode === 0x08) r = sf ? u64(a << BigInt(sh)) : BigInt((Number(a) << sh) >>> 0)
    else if (opcode === 0x09) r = a >> BigInt(sh)
    else if (opcode === 0x0a) r = u64(s64(a) >> BigInt(sh))
    else if (opcode === 0x0b) {
      const bits = sf ? 64 : 32
      r = u64((a >> BigInt(sh)) | (a << BigInt(bits - sh)))
    }
    setXn(cpu, rd, r, sf)
    return 'shift-reg'
  }
  if ((w & 0x7fe00000) === 0x5ac00000 || (w & 0x7fe00c00) === 0x5ac00000) {
    const opcode = bit(w, 10, 15)
    let a = xn(cpu, rn, sf)
    if (opcode === 0x00) a = u64(~a)
    else if (opcode === 0x01) a = u64(-a)
    else if (opcode === 0x04) a = a === 0n ? 0n : 1n
    setXn(cpu, rd, a, sf)
    return 'unary'
  }
  return null
}

export function step(cpu: CpuState, mem: MemOps, svc: Syscall): string {
  if (cpu.halted) return 'halted'
  const w = mem.r32(cpu.pc) >>> 0
  cpu.lastInst = w
  let decoded: string | null = null
  decoded = decodeBranch(cpu, w, mem, svc)
  if (!decoded) decoded = decodeLdst(cpu, w, mem)
  if (!decoded) decoded = decodeDpImm(cpu, w)
  if (!decoded) decoded = decodeDpReg(cpu, w)
  if (!decoded) decoded = `.inst 0x${w.toString(16).padStart(8, '0')}`
  cpu.lastDecoded = decoded
  cpu.pc = u64(cpu.pc + 4n)
  cpu.steps++
  return decoded
}

export function run(cpu: CpuState, mem: MemOps, svc: Syscall, maxSteps = 250000) {
  const start = cpu.steps
  while (!cpu.halted && cpu.steps - start < maxSteps) {
    step(cpu, mem, svc)
  }
  return cpu.steps - start
}

export function dumpRegs(cpu: CpuState) {
  const names = Array.from({ length: 31 }, (_, i) => (i === 29 ? 'fp' : i === 30 ? 'lr' : `x${i}`))
  const lines = []
  for (let i = 0; i < 31; i += 4) {
    const chunk = names.slice(i, i + 4).map((n, k) => `${n.padEnd(3)}=${cpu.x[i + k].toString(16).padStart(16, '0')}`)
    lines.push(chunk.join('  '))
  }
  lines.push(`sp =${cpu.sp.toString(16).padStart(16, '0')}  pc=${cpu.pc.toString(16).padStart(16, '0')}  nzcv=${cpu.nzcv.toString(2).padStart(4, '0')}  steps=${cpu.steps}`)
  return lines.join('\n')
}
