import type { DexInfo } from './dex'
import { logcat } from './logcat'
import { tts } from './tts'
import { net } from './network'
import { audio } from './audio'

export type Frame = {
  regs: number[]
  pc: number
  method: string
  result: number
}

export type BridgeCall = {
  at: number
  clazz: string
  method: string
  args: string[]
  result: string
}

const OP: Record<number, string> = {
  0x00: 'nop',
  0x0e: 'return-void',
  0x0f: 'return',
  0x10: 'return-wide',
  0x11: 'return-object',
  0x12: 'const/4',
  0x13: 'const/16',
  0x14: 'const',
  0x1a: 'const-string',
  0x1c: 'const-class',
  0x1f: 'check-cast',
  0x22: 'new-instance',
  0x27: 'throw',
  0x28: 'goto',
  0x29: 'goto/16',
  0x2a: 'goto/32',
  0x31: 'cmp-long',
  0x32: 'if-eq',
  0x33: 'if-ne',
  0x34: 'if-lt',
  0x35: 'if-ge',
  0x36: 'if-gt',
  0x37: 'if-le',
  0x38: 'if-eqz',
  0x39: 'if-nez',
  0x3a: 'if-ltz',
  0x3b: 'if-gez',
  0x3c: 'if-gtz',
  0x3d: 'if-lez',
  0x44: 'aget',
  0x4b: 'aput',
  0x52: 'iget',
  0x59: 'iput',
  0x60: 'sget',
  0x67: 'sput',
  0x6e: 'invoke-virtual',
  0x6f: 'invoke-super',
  0x70: 'invoke-direct',
  0x71: 'invoke-static',
  0x72: 'invoke-interface',
  0x0a: 'move-result',
  0x0b: 'move-result-wide',
  0x0c: 'move-result-object',
  0x0d: 'move-exception',
  0x01: 'move',
  0x02: 'move/from16',
  0x07: 'move-object',
  0x90: 'add-int',
  0x91: 'sub-int',
  0x92: 'mul-int',
  0x93: 'div-int',
  0x94: 'rem-int',
  0x95: 'and-int',
  0x96: 'or-int',
  0x97: 'xor-int',
  0xb0: 'add-int/2addr',
  0xd8: 'add-int/lit8',
  0xd9: 'rsub-int/lit8',
  0xda: 'mul-int/lit8',
}

export class DalvikVm {
  heap: unknown[] = [null]
  strings: string[] = []
  types: string[] = []
  methods: DexInfo['methods'] = []
  calls: BridgeCall[] = []
  traces: string[] = []
  result: unknown = null

  loadDex(info: DexInfo) {
    this.strings = info.strings
    this.types = info.types
    this.methods = info.methods
  }

  alloc(obj: unknown) {
    this.heap.push(obj)
    return this.heap.length - 1
  }

  bridge(clazz: string, method: string, args: unknown[]): unknown {
    const c = clazz.replace(/\//g, '.')
    const rec: BridgeCall = {
      at: Date.now(),
      clazz: c,
      method,
      args: args.map((a) => String(a)).slice(0, 8),
      result: 'void',
    }
    let result: unknown = null
    try {
      if (c === 'android.util.Log' || c.endsWith('.Log')) {
        const level = method.toLowerCase()
        const tag = String(args[0] ?? 'App')
        const msg = String(args[1] ?? '')
        if (level.startsWith('e')) logcat.e(tag, msg)
        else if (level.startsWith('w')) logcat.w(tag, msg)
        else if (level.startsWith('d')) logcat.d(tag, msg)
        else logcat.i(tag, msg)
        result = 0
      } else if (c === 'java.lang.System' && method === 'currentTimeMillis') {
        result = Date.now()
      } else if (c === 'java.lang.System' && method === 'nanoTime') {
        result = Math.floor(performance.now() * 1e6)
      } else if ((c === 'java.io.PrintStream' || method === 'println' || method === 'print') && (method === 'println' || method === 'print')) {
        logcat.i('System.out', String(args[0] ?? args[1] ?? ''))
        result = null
      } else if (c.includes('TextToSpeech') || method === 'speak') {
        const text = String(args.find((a) => typeof a === 'string') ?? args[0] ?? '')
        tts.speak(text)
        rec.result = 'SUCCESS'
        result = 0
      } else if (c.includes('MediaPlayer') || method === 'start') {
        audio.notify()
        result = null
      } else if (c.includes('okhttp') || c.includes('HttpURLConnection') || c.includes('java.net')) {
        const url = String(args.find((a) => typeof a === 'string' && String(a).startsWith('http')) ?? '')
        if (url) {
          void net.fetch(url).catch(() => undefined)
          result = { url, status: 'enqueued' }
        }
      } else if (method === 'onCreate' || method === 'onResume' || method === 'onStart' || method === 'onPause') {
        logcat.i('ActivityThread', `${c}.${method}()`)
        result = null
      } else if (c.includes('Toast')) {
        logcat.i('Toast', String(args[1] ?? args[0] ?? ''))
        result = { toast: true }
      } else if (method === 'setContentView') {
        logcat.i('PhoneWindow', `setContentView ${args[0]}`)
        result = null
      } else if (method === 'findViewById') {
        result = this.alloc({ id: args[0], type: 'View' })
      } else if (c.includes('SharedPreferences')) {
        result = this.alloc({ prefs: true })
      } else if (method === '<init>' || method === '<clinit>') {
        result = this.alloc({ class: c })
      } else {
        result = this.alloc({ stub: `${c}.${method}` })
      }
    } catch (e) {
      rec.result = 'error ' + (e instanceof Error ? e.message : String(e))
      logcat.e('art', rec.result)
    }
    rec.result = String(result)
    this.calls.unshift(rec)
    if (this.calls.length > 300) this.calls.length = 300
    this.traces.push(`invoke ${c}.${method}(${rec.args.join(', ')}) -> ${rec.result}`)
    return result
  }

  invokeNamed(className: string, method: string, args: unknown[] = []) {
    const hit = this.methods.find((m) => m.className === className && m.name === method)
    logcat.i('art', `invoke ${className}.${method} ${hit ? '(resolved in DEX)' : '(host bridge)'}`)
    return this.bridge(className, method, args)
  }

  launchActivity(className: string) {
    this.traces = []
    logcat.i('ActivityManager', `Start proc for activity ${className}`)
    this.bridge('android.app.ActivityThread', 'main', [])
    this.bridge('android.app.ActivityThread', 'handleLaunchActivity', [className])
    this.bridge(className, 'attach', ['base.context'])
    this.bridge(className, 'onCreate', [null])
    this.bridge(className, 'onStart', [])
    this.bridge(className, 'onResume', [])
    const related = this.methods.filter((m) => m.className === className).slice(0, 40)
    related.forEach((m) => {
      if (['onCreate', 'onStart', 'onResume', 'onPause', 'onStop', '<init>'].includes(m.name)) {
        this.bridge(className, m.name, [])
      }
    })
    return related
  }
}

export function describeOpcode(word: number) {
  const op = word & 0xff
  return OP[op] || `op_${op.toString(16)}`
}
