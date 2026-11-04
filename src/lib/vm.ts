import { createCpu, run as runCpu, step, dumpRegs, type CpuState, type MemOps } from './arm64'
import { GuestMemory } from './memory'
import { parseElf, type ElfInfo } from './elf'
import { logcat } from './logcat'
import type { VirtualFs } from './vfs'

export type LoadedImage = {
  path: string
  base: bigint
  entry: bigint
  elf: ElfInfo
  size: number
}

export type VmEvent = {
  at: number
  kind: 'boot' | 'syscall' | 'load' | 'jni' | 'halt' | 'log'
  text: string
}

const SYS: Record<number, string> = {
  17: 'getcwd',
  23: 'dup',
  24: 'dup3',
  25: 'fcntl',
  29: 'ioctl',
  56: 'openat',
  57: 'close',
  61: 'wait4',
  62: 'lseek',
  63: 'read',
  64: 'write',
  78: 'readlinkat',
  79: 'newfstatat',
  80: 'fstat',
  93: 'exit',
  94: 'exit_group',
  96: 'set_tid_address',
  98: 'futex',
  113: 'clock_gettime',
  160: 'uname',
  169: 'gettimeofday',
  172: 'getpid',
  174: 'getuid',
  175: 'geteuid',
  178: 'gettid',
  214: 'brk',
  215: 'munmap',
  222: 'mmap',
  226: 'mprotect',
  220: 'clone',
  221: 'execve',
  260: 'wait4',
  281: 'ppoll',
}

export class Arm64Vm {
  mem = new GuestMemory()
  cpu: CpuState = createCpu(0n, 0n)
  images: LoadedImage[] = []
  nextBase = 0x400000n
  fds = new Map<number, { path: string; pos: number; data?: Uint8Array }>()
  nextFd = 3
  events: VmEvent[] = []
  stdout = ''
  fs: VirtualFs | null = null
  running = false
  loadAddr = 0x400000n
  stackTop = 0x7ffffff000n

  constructor(fs?: VirtualFs) {
    this.fs = fs ?? null
    this.fds.set(0, { path: '/dev/stdin', pos: 0 })
    this.fds.set(1, { path: '/dev/stdout', pos: 0 })
    this.fds.set(2, { path: '/dev/stderr', pos: 0 })
    this.resetCpu()
  }

  emit(kind: VmEvent['kind'], text: string) {
    this.events.unshift({ at: Date.now(), kind, text })
    if (this.events.length > 400) this.events.length = 400
    logcat.d('qemu-arm64', text)
  }

  resetCpu() {
    this.cpu = createCpu(0n, this.stackTop - 0x100n)
    this.mem.mapBytes(this.stackTop - 0x100000n, new Uint8Array(0x100000))
  }

  loadElf(buffer: ArrayBuffer, path: string, preferred = 0n): LoadedImage {
    const elf = parseElf(buffer, path)
    let base = preferred || this.nextBase
    if (base % 0x1000n) base += 0x1000n - (base % 0x1000n)
    const bytes = new Uint8Array(buffer)
    this.mem.mapBytes(base, bytes)
    const entry = base + BigInt(elf.entry || 0)
    const img: LoadedImage = { path, base, entry, elf, size: buffer.byteLength }
    this.images.push(img)
    this.nextBase = base + BigInt(((buffer.byteLength + 0xfff) >> 12) << 12)
    this.emit('load', `mapped ${path} ${elf.machine} ${elf.klass}-bit @ 0x${base.toString(16)} entry 0x${entry.toString(16)}`)
    return img
  }

  syscall = (cpu: CpuState, mem: MemOps) => {
    const nr = Number(cpu.x[8] & 0xffffffffn)
    const a0 = cpu.x[0]
    const a1 = cpu.x[1]
    const a2 = cpu.x[2]
    const name = SYS[nr] || `sys_${nr}`
    let ret = 0n
    try {
      switch (nr) {
        case 64: {
          const fd = Number(a0)
          const n = Number(a2)
          const buf = this.mem.readBytes(a1, Math.min(n, 65536))
          const text = new TextDecoder().decode(buf)
          if (fd === 1 || fd === 2) {
            this.stdout += text
            logcat.i(fd === 1 ? 'stdout' : 'stderr', text.replace(/\n$/, ''))
          }
          ret = BigInt(buf.length)
          this.emit('syscall', `write(${fd}, ${JSON.stringify(text.slice(0, 80))}, ${n}) = ${ret}`)
          break
        }
        case 63: {
          const n = Number(a2)
          ret = 0n
          this.emit('syscall', `read(${a0}, ${n}) = 0`)
          break
        }
        case 93:
        case 94:
          cpu.halted = true
          cpu.exitCode = Number(a0 & 0xffn)
          this.emit('halt', `exit(${cpu.exitCode})`)
          ret = a0
          break
        case 214: {
          if (a0 === 0n) ret = this.mem.brk
          else {
            this.mem.brk = a0
            if (a0 > this.mem.heapEnd) this.mem.mmap(Number(a0 - this.mem.heapEnd), this.mem.heapEnd)
            ret = a0
          }
          this.emit('syscall', `brk(0x${a0.toString(16)}) = 0x${ret.toString(16)}`)
          break
        }
        case 222: {
          const len = Number(a1) || 4096
          const addr = this.mem.mmap(len, a0)
          ret = addr
          this.emit('syscall', `mmap(len=${len}) = 0x${addr.toString(16)}`)
          break
        }
        case 215:
        case 226:
          ret = 0n
          break
        case 56: {
          const path = this.mem.readCString(a1)
          const node = this.fs?.stat(path)
          const fd = this.nextFd++
          this.fds.set(fd, { path, pos: 0, data: node?.content })
          ret = BigInt(fd)
          this.emit('syscall', `openat(${JSON.stringify(path)}) = ${fd}`)
          break
        }
        case 57:
          this.fds.delete(Number(a0))
          ret = 0n
          break
        case 160: {
          const uts = a0
          const fields = ['Linux', 'aetherq', '4.14.180-aetherq', '#1 SMP PREEMPT', 'aarch64']
          let off = 0n
          for (const f of fields) {
            this.mem.writeCString(uts + off, f)
            off += 65n
          }
          ret = 0n
          this.emit('syscall', 'uname()')
          break
        }
        case 172:
          ret = 1n
          break
        case 178:
          ret = 1n
          break
        case 174:
        case 175:
          ret = 0n
          break
        case 96:
          ret = 1n
          break
        case 113: {
          const now = Date.now()
          mem.w64(a1, BigInt(Math.floor(now / 1000)))
          mem.w64(a1 + 8n, BigInt((now % 1000) * 1_000_000))
          ret = 0n
          break
        }
        case 169: {
          const now = Date.now()
          mem.w64(a0, BigInt(Math.floor(now / 1000)))
          mem.w64(a0 + 8n, BigInt((now % 1000) * 1000))
          ret = 0n
          break
        }
        case 17: {
          const s = '/'
          this.mem.writeCString(a0, s)
          ret = BigInt(s.length + 1)
          break
        }
        default:
          this.emit('syscall', `${name}(${a0}, ${a1}, ${a2}) = -ENOSYS`)
          ret = -38n
      }
    } catch (e) {
      this.emit('syscall', `${name} fault: ${e instanceof Error ? e.message : String(e)}`)
      ret = -14n
    }
    cpu.x[0] = ret & 0xffffffffffffffffn
  }

  execute(entry: bigint, maxSteps = 200000) {
    this.cpu.pc = entry
    this.cpu.halted = false
    this.running = true
    const n = runCpu(this.cpu, this.mem, this.syscall, maxSteps)
    this.running = false
    return n
  }

  stepOne() {
    return step(this.cpu, this.mem, this.syscall)
  }

  runJniOnLoad(img: LoadedImage) {
    const sym = img.elf.symbols.find((s) => s === 'JNI_OnLoad' || s.endsWith('JNI_OnLoad'))
    this.emit('jni', `JNI_OnLoad ${sym ? 'symbol present' : 'not exported'} in ${img.path}`)
    if (!img.elf.isArm64) {
      this.emit('jni', `skip: ${img.elf.machine}`)
      return { ran: false, steps: 0 }
    }
    this.cpu.x[0] = 0x1000n
    this.cpu.x[1] = 0x10000n
    this.mem.w32(0x10000n, 0x00010006)
    const steps = this.execute(img.entry || img.base, 80000)
    return { ran: true, steps }
  }

  regs() {
    return dumpRegs(this.cpu)
  }
}
