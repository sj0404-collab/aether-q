import { BinReader, hexdump } from './binary'

const EM_AARCH64 = 183
const EM_ARM = 40
const EM_X86_64 = 62
const PT_LOAD = 1
const PT_DYNAMIC = 2
const PT_INTERP = 3
const SHT_DYNSYM = 11
const SHT_SYMTAB = 2
const SHT_STRTAB = 3

const ARM64_MACHINES: Record<number, string> = {
  [EM_AARCH64]: 'AArch64 (ARM64)',
  [EM_ARM]: 'ARM',
  [EM_X86_64]: 'x86_64',
  3: 'x86',
}

export type ElfInfo = {
  path: string
  valid: boolean
  klass: 32 | 64 | 0
  little: boolean
  machine: string
  machineId: number
  type: string
  entry: number
  phnum: number
  shnum: number
  interp: string
  soname: string
  needed: string[]
  symbols: string[]
  sections: { name: string; type: number; addr: number; size: number }[]
  textPreview: string
  disasm: string[]
  isArm64: boolean
}

const ELF_TYPES: Record<number, string> = {
  0: 'NONE',
  1: 'REL',
  2: 'EXEC',
  3: 'DYN (shared object)',
  4: 'CORE',
}

function decodeArm64(word: number, addr: number): string {
  const hex = `0x${word.toString(16).padStart(8, '0')}`
  const a = `0x${addr.toString(16)}`
  if (word === 0xd503201f) return `${a}:  nop`
  if (word === 0xd65f03c0) return `${a}:  ret`
  if ((word & 0xffe0ffff) === 0xd4000001) return `${a}:  svc #${(word >>> 5) & 0xffff}`
  if ((word >>> 26) === 0x25) {
    const imm = (word << 6) >> 6
    return `${a}:  bl  ${a} + ${imm * 4}`
  }
  if ((word >>> 26) === 0x05) {
    const imm = (word << 6) >> 6
    return `${a}:  b   ${a} + ${imm * 4}`
  }
  if ((word & 0xff800000) === 0xd2800000) {
    const rd = word & 0x1f
    const imm = (word >>> 5) & 0xffff
    return `${a}:  mov x${rd}, #${imm}`
  }
  if ((word & 0xff800000) === 0xf2800000) {
    const rd = word & 0x1f
    const imm = (word >>> 5) & 0xffff
    return `${a}:  movk x${rd}, #${imm}`
  }
  if ((word & 0xff000000) === 0x91000000) {
    const rd = word & 0x1f
    const rn = (word >>> 5) & 0x1f
    const imm = (word >>> 10) & 0xfff
    return `${a}:  add x${rd}, x${rn}, #${imm}`
  }
  if ((word & 0xff000000) === 0xd1000000) {
    const rd = word & 0x1f
    const rn = (word >>> 5) & 0x1f
    const imm = (word >>> 10) & 0xfff
    return `${a}:  sub x${rd}, x${rn}, #${imm}`
  }
  if ((word & 0xffc00000) === 0xf9400000) {
    const rt = word & 0x1f
    const rn = (word >>> 5) & 0x1f
    const imm = ((word >>> 10) & 0xfff) * 8
    return `${a}:  ldr x${rt}, [x${rn}, #${imm}]`
  }
  if ((word & 0xffc00000) === 0xf9000000) {
    const rt = word & 0x1f
    const rn = (word >>> 5) & 0x1f
    const imm = ((word >>> 10) & 0xfff) * 8
    return `${a}:  str x${rt}, [x${rn}, #${imm}]`
  }
  if ((word & 0x9f000000) === 0x90000000) {
    const rd = word & 0x1f
    return `${a}:  adrp x${rd}, #page`
  }
  return `${a}:  .inst ${hex}`
}

export function parseElf(buffer: ArrayBuffer, path: string): ElfInfo {
  const empty: ElfInfo = {
    path,
    valid: false,
    klass: 0,
    little: true,
    machine: 'unknown',
    machineId: 0,
    type: '',
    entry: 0,
    phnum: 0,
    shnum: 0,
    interp: '',
    soname: '',
    needed: [],
    symbols: [],
    sections: [],
    textPreview: '',
    disasm: [],
    isArm64: false,
  }
  if (buffer.byteLength < 64) return empty
  const r = new BinReader(buffer)
  const mag = r.bytes(4)
  if (mag[0] !== 0x7f || mag[1] !== 0x45 || mag[2] !== 0x4c || mag[3] !== 0x46) return empty
  const klass = r.u8() === 2 ? 64 : 32
  const little = r.u8() === 1
  r.little = little
  r.skip(10)
  const eType = r.u16()
  const machineId = r.u16()
  r.u32()
  const entry = klass === 64 ? r.u64() : r.u32()
  const phoff = klass === 64 ? r.u64() : r.u32()
  const shoff = klass === 64 ? r.u64() : r.u32()
  r.u32()
  r.u16()
  const phentsize = r.u16()
  const phnum = r.u16()
  const shentsize = r.u16()
  const shnum = r.u16()
  const shstrndx = r.u16()

  let interp = ''
  const needed: string[] = []
  let soname = ''
  let dynOff = 0
  let dynSz = 0
  let textOff = 0
  let textAddr = 0
  let textSize = 0

  for (let i = 0; i < phnum; i++) {
    r.seek(phoff + i * phentsize)
    const pType = r.u32()
    if (klass === 64) r.u32()
    const offset = klass === 64 ? r.u64() : r.u32()
    const vaddr = klass === 64 ? r.u64() : r.u32()
    if (klass === 64) r.u64()
    else r.u32()
    const filesz = klass === 64 ? r.u64() : r.u32()
    if (pType === PT_INTERP) {
      r.seek(offset)
      interp = r.ascii(Math.min(filesz, 256))
    }
    if (pType === PT_DYNAMIC) {
      dynOff = offset
      dynSz = filesz
    }
    if (pType === PT_LOAD && textOff === 0) {
      textOff = offset
      textAddr = vaddr
      textSize = filesz
    }
  }

  const sections: ElfInfo['sections'] = []
  let shstrOff = 0
  if (shnum && shstrndx < shnum) {
    r.seek(shoff + shstrndx * shentsize)
    if (klass === 64) {
      r.skip(24)
      shstrOff = r.u64()
    } else {
      r.skip(16)
      shstrOff = r.u32()
    }
  }

  const readStr = (off: number) => {
    if (!off || off >= r.size) return ''
    r.seek(off)
    return r.cstring()
  }

  let dynsymOff = 0
  let dynsymSize = 0
  let dynstrOff = 0
  let dynstrSize = 0

  for (let i = 0; i < shnum; i++) {
    r.seek(shoff + i * shentsize)
    const nameOff = r.u32()
    const shType = r.u32()
    if (klass === 64) {
      r.u64()
      const addr = r.u64()
      const offset = r.u64()
      const size = r.u64()
      const name = shstrOff ? readStr(shstrOff + nameOff) : ''
      sections.push({ name, type: shType, addr, size })
      if (name === '.text') {
        textOff = offset
        textAddr = addr
        textSize = size
      }
      if (shType === SHT_DYNSYM) {
        dynsymOff = offset
        dynsymSize = size
      }
      if (shType === SHT_STRTAB && name === '.dynstr') {
        dynstrOff = offset
        dynstrSize = size
      }
      if (shType === SHT_SYMTAB && !dynsymOff) {
        dynsymOff = offset
        dynsymSize = size
      }
    } else {
      r.u32()
      const addr = r.u32()
      const offset = r.u32()
      const size = r.u32()
      const name = shstrOff ? readStr(shstrOff + nameOff) : ''
      sections.push({ name, type: shType, addr, size })
    }
  }

  const symbols: string[] = []
  const ent = klass === 64 ? 24 : 16
  if (dynsymOff && dynstrOff) {
    const count = Math.min(Math.floor(dynsymSize / ent), 400)
    for (let i = 0; i < count; i++) {
      r.seek(dynsymOff + i * ent)
      const stName = r.u32()
      const nm = readStr(dynstrOff + stName)
      if (nm) symbols.push(nm)
    }
  }

  if (dynOff && dynstrOff) {
    const dEnt = klass === 64 ? 16 : 8
    const n = Math.min(Math.floor(dynSz / dEnt), 200)
    for (let i = 0; i < n; i++) {
      r.seek(dynOff + i * dEnt)
      const tag = klass === 64 ? r.u64() : r.u32()
      const val = klass === 64 ? r.u64() : r.u32()
      if (tag === 1 && dynstrOff) needed.push(readStr(dynstrOff + val))
      if (tag === 14 && dynstrOff) soname = readStr(dynstrOff + val)
      if (tag === 0) break
    }
  }

  const disasm: string[] = []
  if (machineId === EM_AARCH64 && textOff) {
    const n = Math.min(32, Math.floor(Math.min(textSize, 128) / 4))
    r.seek(textOff)
    for (let i = 0; i < n; i++) {
      const w = r.u32()
      disasm.push(decodeArm64(w, textAddr + i * 4))
    }
  }

  const previewBytes = new Uint8Array(buffer, textOff || 0, Math.min(64, buffer.byteLength - (textOff || 0)))

  void dynstrSize

  return {
    path,
    valid: true,
    klass,
    little,
    machine: ARM64_MACHINES[machineId] ?? `machine ${machineId}`,
    machineId,
    type: ELF_TYPES[eType] ?? String(eType),
    entry,
    phnum,
    shnum,
    interp,
    soname,
    needed: needed.filter(Boolean),
    symbols: symbols.filter(Boolean).slice(0, 200),
    sections: sections.slice(0, 80),
    textPreview: hexdump(previewBytes, 64),
    disasm,
    isArm64: machineId === EM_AARCH64,
  }
}
