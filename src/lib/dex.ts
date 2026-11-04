import { BinReader } from './binary'

export type DexClass = {
  name: string
  superName: string
  sourceFile: string
  methods: string[]
  fields: string[]
}

export type DexInfo = {
  magic: string
  version: string
  checksum: string
  fileSize: number
  headerSize: number
  stringCount: number
  typeCount: number
  protoCount: number
  fieldCount: number
  methodCount: number
  classCount: number
  strings: string[]
  types: string[]
  classes: DexClass[]
  methods: { className: string; name: string; proto: string }[]
}

function mutf8(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0) break
    if (b < 0x80) s += String.fromCharCode(b)
    else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f))
    } else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f))
    }
  }
  return s
}

function uleb(r: BinReader) {
  let result = 0
  let shift = 0
  for (let i = 0; i < 5; i++) {
    const b = r.u8()
    result |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return result >>> 0
}

function typeToJava(t: string): string {
  if (!t) return t
  if (t.startsWith('L') && t.endsWith(';')) return t.slice(1, -1).replace(/\//g, '.')
  if (t.startsWith('[')) return typeToJava(t.slice(1)) + '[]'
  const prim: Record<string, string> = {
    V: 'void',
    Z: 'boolean',
    B: 'byte',
    S: 'short',
    C: 'char',
    I: 'int',
    J: 'long',
    F: 'float',
    D: 'double',
  }
  return prim[t] ?? t
}

export function parseDex(buffer: ArrayBuffer, opts?: { maxClasses?: number; maxMethods?: number }): DexInfo {
  const r = new BinReader(buffer)
  const magic = r.ascii(8)
  if (!magic.startsWith('dex\n')) {
    throw new Error('Not a DEX file')
  }
  const version = magic.slice(4).replace(/\0/g, '')
  const checksum = r.u32().toString(16).padStart(8, '0')
  r.skip(20) // sha1
  const fileSize = r.u32()
  const headerSize = r.u32()
  r.u32() // endian
  r.skip(8) // link
  r.u32() // mapOff
  const stringIdsSize = r.u32()
  const stringIdsOff = r.u32()
  const typeIdsSize = r.u32()
  const typeIdsOff = r.u32()
  const protoIdsSize = r.u32()
  const protoIdsOff = r.u32()
  const fieldIdsSize = r.u32()
  const fieldIdsOff = r.u32()
  const methodIdsSize = r.u32()
  const methodIdsOff = r.u32()
  const classDefsSize = r.u32()
  const classDefsOff = r.u32()

  const readString = (idx: number) => {
    if (idx < 0 || idx >= stringIdsSize) return ''
    r.seek(stringIdsOff + idx * 4)
    const off = r.u32()
    r.seek(off)
    const len = uleb(r)
    const bytes = r.bytes(Math.min(len * 3, r.size - r.offset))
    return mutf8(bytes)
  }

  const strings: string[] = []
  const stringLimit = Math.min(stringIdsSize, 8000)
  for (let i = 0; i < stringLimit; i++) strings.push(readString(i))

  const types: string[] = []
  const typeLimit = Math.min(typeIdsSize, 4000)
  for (let i = 0; i < typeLimit; i++) {
    r.seek(typeIdsOff + i * 4)
    const sidx = r.u32()
    types.push(sidx < strings.length ? strings[sidx] : readString(sidx))
  }

  const typeName = (idx: number) => {
    if (idx < types.length) return types[idx]
    r.seek(typeIdsOff + idx * 4)
    return readString(r.u32())
  }

  const protoDesc = (idx: number) => {
    r.seek(protoIdsOff + idx * 12)
    r.u32()
    const retIdx = r.u32()
    return typeToJava(typeName(retIdx))
  }

  const maxMethods = opts?.maxMethods ?? 2500
  const methods: DexInfo['methods'] = []
  const methodLimit = Math.min(methodIdsSize, maxMethods)
  for (let i = 0; i < methodLimit; i++) {
    r.seek(methodIdsOff + i * 8)
    const classIdx = r.u16()
    const protoIdx = r.u16()
    const nameIdx = r.u32()
    methods.push({
      className: typeToJava(typeName(classIdx)),
      name: nameIdx < strings.length ? strings[nameIdx] : readString(nameIdx),
      proto: protoDesc(protoIdx),
    })
  }

  const maxClasses = opts?.maxClasses ?? 400
  const classes: DexClass[] = []
  const classLimit = Math.min(classDefsSize, maxClasses)
  for (let i = 0; i < classLimit; i++) {
    r.seek(classDefsOff + i * 32)
    const classIdx = r.u32()
    r.u32() // access
    const superIdx = r.u32()
    r.u32() // interfaces
    const sourceIdx = r.i32()
    r.skip(12)
    const name = typeToJava(typeName(classIdx))
    const superName = superIdx === 0xffffffff ? '' : typeToJava(typeName(superIdx))
    const sourceFile = sourceIdx >= 0 ? (sourceIdx < strings.length ? strings[sourceIdx] : readString(sourceIdx)) : ''
    const classMethods = methods.filter((m) => m.className === name).slice(0, 40)
    classes.push({
      name,
      superName,
      sourceFile,
      methods: classMethods.map((m) => `${m.proto} ${m.name}()`),
      fields: [],
    })
  }

  void fieldIdsOff
  void headerSize

  return {
    magic,
    version,
    checksum,
    fileSize,
    headerSize,
    stringCount: stringIdsSize,
    typeCount: typeIdsSize,
    protoCount: protoIdsSize,
    fieldCount: fieldIdsSize,
    methodCount: methodIdsSize,
    classCount: classDefsSize,
    strings: strings.slice(0, 2000),
    types: types.map(typeToJava).slice(0, 1500),
    classes,
    methods,
  }
}

export function scanFramework(strings: string[], types: string[], classNames: string[]) {
  const blob = (strings.join('\n') + '\n' + types.join('\n') + '\n' + classNames.join('\n')).toLowerCase()
  const has = (...xs: string[]) => xs.some((x) => blob.includes(x.toLowerCase()))
  return {
    kotlin: has('kotlin/', 'lkotlin/', 'kotlin.metadata', '.kotlin_module'),
    compose: has('androidx/compose', 'androidx.compose', 'androidxcompose'),
    reactNative: has('com/facebook/react', 'reactnativejni', 'com.facebook.react'),
    flutter: has('io/flutter', 'io.flutter', 'flutterengine'),
    cordova: has('org/apache/cordova', 'cordova.js', 'cordova/plugin'),
    capacitor: has('com/getcapacitor', 'capacitor.js', 'capacitor.config'),
    unity: has('com/unity3d', 'libunity.so', 'unityengine'),
    xamarin: has('mono.android', 'xamarin', 'assemblies/'),
    jetpack: has('androidx/'),
    okhttp: has('okhttp3', 'okhttp'),
    retrofit: has('retrofit2'),
    gson: has('com/google/gson'),
    firebase: has('com/google/firebase'),
    glide: has('com/bumptech/glide'),
    hilt: has('dagger/hilt', 'androidx/hilt'),
    coroutines: has('kotlinx/coroutines'),
    timber: has('timber.log'),
  }
}
