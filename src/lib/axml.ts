import { BinReader } from './binary'

const RES_STRING_POOL = 0x0001
const RES_XML = 0x0003
const RES_XML_START_NAMESPACE = 0x0100
const RES_XML_END_NAMESPACE = 0x0101
const RES_XML_START_ELEMENT = 0x0102
const RES_XML_END_ELEMENT = 0x0103
const RES_XML_CDATA = 0x0104
const RES_XML_RESOURCE_MAP = 0x0180

const TYPE_NULL = 0x00
const TYPE_REFERENCE = 0x01
const TYPE_ATTRIBUTE = 0x02
const TYPE_STRING = 0x03
const TYPE_FLOAT = 0x04
const TYPE_DIMENSION = 0x05
const TYPE_FRACTION = 0x06
const TYPE_DYNAMIC_REFERENCE = 0x07
const TYPE_INT_DEC = 0x10
const TYPE_INT_HEX = 0x11
const TYPE_INT_BOOLEAN = 0x12
const TYPE_INT_COLOR_ARGB8 = 0x1c
const TYPE_INT_COLOR_RGB8 = 0x1d
const TYPE_INT_COLOR_ARGB4 = 0x1e
const TYPE_INT_COLOR_RGB4 = 0x1f

export const ANDROID_ATTR: Record<number, string> = {
  0x01010000: 'theme',
  0x01010001: 'label',
  0x01010002: 'icon',
  0x01010003: 'name',
  0x01010006: 'permission',
  0x01010007: 'readPermission',
  0x01010008: 'writePermission',
  0x0101000b: 'sharedUserId',
  0x0101000c: 'protectionLevel',
  0x0101000e: 'enabled',
  0x0101000f: 'debuggable',
  0x01010010: 'exported',
  0x01010011: 'process',
  0x01010012: 'taskAffinity',
  0x01010013: 'multiprocess',
  0x01010014: 'finishOnTaskLaunch',
  0x01010015: 'clearTaskOnLaunch',
  0x01010016: 'stateNotNeeded',
  0x01010017: 'excludeFromRecents',
  0x01010018: 'authorities',
  0x01010019: 'syncable',
  0x0101001a: 'initOrder',
  0x0101001b: 'grantUriPermissions',
  0x0101001c: 'priority',
  0x0101001d: 'launchMode',
  0x0101001e: 'screenOrientation',
  0x0101001f: 'configChanges',
  0x01010020: 'description',
  0x01010021: 'targetPackage',
  0x01010022: 'handleProfiling',
  0x01010023: 'functionalTest',
  0x01010024: 'value',
  0x01010025: 'resource',
  0x01010026: 'mimeType',
  0x01010027: 'scheme',
  0x01010028: 'host',
  0x01010029: 'port',
  0x0101002a: 'path',
  0x0101002b: 'pathPrefix',
  0x0101002c: 'pathPattern',
  0x0101002d: 'action',
  0x0101002e: 'data',
  0x0101002f: 'targetClass',
  0x01010030: 'colorForeground',
  0x01010031: 'colorBackground',
  0x01010050: 'windowIsFloating',
  0x01010051: 'windowNoTitle',
  0x01010054: 'windowFullscreen',
  0x0101006c: 'text',
  0x01010070: 'id',
  0x01010094: 'padding',
  0x01010095: 'paddingLeft',
  0x01010096: 'paddingTop',
  0x01010097: 'paddingRight',
  0x01010098: 'paddingBottom',
  0x01010099: 'focusable',
  0x0101009a: 'visibility',
  0x0101009c: 'scrollbars',
  0x0101009e: 'clickable',
  0x010100b2: 'entries',
  0x010100b3: 'layout_width',
  0x010100b4: 'layout_height',
  0x010100b5: 'layout_margin',
  0x010100d4: 'src',
  0x010100e1: 'hint',
  0x010100e2: 'maxLines',
  0x010100ea: 'inputType',
  0x010100f2: 'orientation',
  0x010100f4: 'layout_weight',
  0x010100f5: 'layout_gravity',
  0x0101011f: 'maxWidth',
  0x01010120: 'maxHeight',
  0x01010125: 'drawableLeft',
  0x0101013f: 'minWidth',
  0x01010140: 'minHeight',
  0x0101014f: 'text',
  0x01010150: 'hint',
  0x01010151: 'textColor',
  0x01010152: 'textColorHighlight',
  0x01010153: 'textColorHint',
  0x0101014e: 'textSize',
  0x01010155: 'textStyle',
  0x01010159: 'typeface',
  0x0101016e: 'background',
  0x01010194: 'gravity',
  0x01010196: 'shadowColor',
  0x01010198: 'numeric',
  0x01010199: 'digits',
  0x0101019e: 'phoneNumber',
  0x010101cf: 'windowBackground',
  0x010101d0: 'windowFrame',
  0x010101e0: 'windowSoftInputMode',
  0x01010203: 'scaleType',
  0x0101020c: 'minSdkVersion',
  0x0101020d: 'maxSdkVersion',
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x0101021d: 'versionCodeMajor',
  0x01010225: 'installLocation',
  0x01010227: 'required',
  0x0101022b: 'windowSoftInputMode',
  0x0101022c: 'launchMode',
  0x0101024e: 'targetSdkVersion',
  0x01010270: 'targetSdkVersion',
  0x01010272: 'maxSdkVersion',
  0x0101027f: 'backupAgent',
  0x01010280: 'allowBackup',
  0x010102b7: 'installLocation',
  0x010102be: 'logo',
  0x010102c0: 'vmSafeMode',
  0x010102d3: 'hardwareAccelerated',
  0x010102eb: 'largeHeap',
  0x01010303: 'uiOptions',
  0x0101031f: 'showOnLockScreen',
  0x01010320: 'format',
  0x0101033f: 'glEsVersion',
  0x01010354: 'required',
  0x01010355: 'name',
  0x010103a7: 'parentActivityName',
  0x010103af: 'supportsRtl',
  0x010103c5: 'permissionFlags',
  0x010103e8: 'requiredAccountType',
  0x010103f2: 'banner',
  0x010103f6: 'isGame',
  0x0101044a: 'usesCleartextTraffic',
  0x0101045d: 'resizeableActivity',
  0x0101045e: 'supportsPictureInPicture',
  0x010104ea: 'extractNativeLibs',
  0x01010527: 'networkSecurityConfig',
  0x0101052c: 'roundIcon',
  0x01010545: 'appCategory',
  0x0101054b: 'appComponentFactory',
  0x0101055a: 'appComponentFactory',
  0x01010572: 'compileSdkVersion',
  0x01010573: 'compileSdkVersionCodename',
  0x0101057a: 'requestLegacyExternalStorage',
  0x0101057e: 'hasFragileUserData',
  0x0101057f: 'allowAudioPlaybackCapture',
  0x01010587: 'requestLegacyExternalStorage',
}

export type AxmlAttr = {
  name: string
  ns: string
  value: string
  raw: string | number
  type: number
  resid: number
}

export type AxmlNode = {
  name: string
  ns: string
  attrs: Record<string, string>
  attrList: AxmlAttr[]
  children: AxmlNode[]
  text?: string
}

function readUtf8Len(r: BinReader) {
  let u8 = r.u8()
  if (u8 & 0x80) u8 = ((u8 & 0x7f) << 8) | r.u8()
  return u8
}

function decodeStringPool(r: BinReader, chunkStart: number, headerSize: number, chunkSize: number) {
  const stringCount = r.u32()
  const styleCount = r.u32()
  const flags = r.u32()
  const stringsStart = r.u32()
  r.u32() // stylesStart
  const utf8 = (flags & 0x100) !== 0
  const offsets: number[] = []
  for (let i = 0; i < stringCount; i++) offsets.push(r.u32())
  const strings: string[] = []
  const poolBase = chunkStart + stringsStart
  for (let i = 0; i < stringCount; i++) {
    r.seek(poolBase + offsets[i])
    try {
      if (utf8) {
        readUtf8Len(r)
        const byteLen = readUtf8Len(r)
        const bytes = r.bytes(byteLen)
        strings.push(new TextDecoder('utf-8').decode(bytes))
      } else {
        let charCount = r.u16()
        if (charCount & 0x8000) charCount = ((charCount & 0x7fff) << 16) | r.u16()
        let s = ''
        for (let c = 0; c < charCount; c++) {
          const ch = r.u16()
          if (ch === 0) break
          s += String.fromCharCode(ch)
        }
        strings.push(s)
      }
    } catch {
      strings.push('')
    }
  }
  r.seek(chunkStart + chunkSize)
  void headerSize
  void styleCount
  return strings
}

function typedValue(type: number, data: number, strings: string[]): string {
  switch (type) {
    case TYPE_NULL:
      return ''
    case TYPE_REFERENCE:
    case TYPE_ATTRIBUTE:
    case TYPE_DYNAMIC_REFERENCE:
      return `@${(data >>> 24).toString(16).padStart(2, '0')}${(data & 0xffffff).toString(16).padStart(6, '0')}`
    case TYPE_STRING:
      return strings[data] ?? ''
    case TYPE_FLOAT: {
      const buf = new ArrayBuffer(4)
      new DataView(buf).setUint32(0, data, true)
      return String(new DataView(buf).getFloat32(0, true))
    }
    case TYPE_INT_DEC:
      return String(data | 0)
    case TYPE_INT_HEX:
      return '0x' + (data >>> 0).toString(16)
    case TYPE_INT_BOOLEAN:
      return data !== 0 ? 'true' : 'false'
    case TYPE_INT_COLOR_ARGB8:
    case TYPE_INT_COLOR_RGB8:
    case TYPE_INT_COLOR_ARGB4:
    case TYPE_INT_COLOR_RGB4:
      return '#' + (data >>> 0).toString(16).padStart(8, '0')
    case TYPE_DIMENSION: {
      const units = ['px', 'dp', 'sp', 'pt', 'in', 'mm']
      const unit = units[data & 0xf] ?? 'px'
      const val = data >> 8
      return `${val}${unit}`
    }
    case TYPE_FRACTION:
      return `${data >> 7}%`
    default:
      return String(data)
  }
}

export function parseAxml(buffer: ArrayBuffer): AxmlNode {
  const r = new BinReader(buffer)
  const magic = r.u16()
  const headerSize = r.u16()
  const fileSize = r.u32()
  if (magic !== RES_XML) {
    throw new Error(`Not binary XML (got 0x${magic.toString(16)})`)
  }
  void headerSize
  void fileSize

  let strings: string[] = []
  const resMap: number[] = []
  const nsPrefix: Record<string, string> = {}
  const root: AxmlNode = { name: '#root', ns: '', attrs: {}, attrList: [], children: [] }
  const stack: AxmlNode[] = [root]

  while (r.offset + 8 <= r.size) {
    const start = r.offset
    const type = r.u16()
    const hSize = r.u16()
    const chunkSize = r.u32()
    if (chunkSize < 8 || start + chunkSize > r.size) break

    if (type === RES_STRING_POOL) {
      r.seek(start + 8)
      strings = decodeStringPool(r, start, hSize, chunkSize)
      continue
    }
    if (type === RES_XML_RESOURCE_MAP) {
      const count = (chunkSize - 8) / 4
      for (let i = 0; i < count; i++) resMap.push(r.u32())
      r.seek(start + chunkSize)
      continue
    }
    if (type === RES_XML_START_NAMESPACE) {
      r.seek(start + hSize)
      const prefixIdx = r.i32()
      const uriIdx = r.i32()
      const prefix = prefixIdx >= 0 ? strings[prefixIdx] : 'android'
      const uri = uriIdx >= 0 ? strings[uriIdx] : ''
      if (uri) nsPrefix[uri] = prefix
      r.seek(start + chunkSize)
      continue
    }
    if (type === RES_XML_END_NAMESPACE) {
      r.seek(start + chunkSize)
      continue
    }
    if (type === RES_XML_START_ELEMENT) {
      r.seek(start + 16)
      const nsIdx = r.i32()
      const nameIdx = r.i32()
      r.skip(2) // attributeStart
      r.skip(2) // attributeSize
      const attrCount = r.u16()
      r.skip(2) // idIndex
      r.skip(2) // classIndex
      r.skip(2) // styleIndex
      const name = nameIdx >= 0 ? strings[nameIdx] ?? 'node' : 'node'
      const ns = nsIdx >= 0 ? strings[nsIdx] ?? '' : ''
      const node: AxmlNode = { name, ns, attrs: {}, attrList: [], children: [] }
      for (let i = 0; i < attrCount; i++) {
        const aNs = r.i32()
        const aName = r.i32()
        const aRaw = r.i32()
        r.skip(2) // size
        r.skip(1) // res0
        const dataType = r.u8()
        const data = r.u32()
        const rawName = aName >= 0 ? strings[aName] ?? '' : ''
        const resid = aName >= 0 && aName < resMap.length ? resMap[aName] : 0
        const mapped = resid ? ANDROID_ATTR[resid] : undefined
        const attrName = rawName || mapped || (resid ? `attr_0x${resid.toString(16)}` : `a${i}`)
        const nsUri = aNs >= 0 ? strings[aNs] ?? '' : ''
        const value =
          aRaw >= 0 && strings[aRaw] !== undefined && dataType === TYPE_STRING
            ? strings[aRaw]
            : typedValue(dataType, data, strings)
        const prefix = nsUri ? nsPrefix[nsUri] || 'android' : ''
        const key = prefix ? `${prefix}:${attrName}` : attrName
        node.attrs[key] = value
        if (!node.attrs[attrName]) node.attrs[attrName] = value
        node.attrList.push({
          name: attrName,
          ns: prefix,
          value,
          raw: data,
          type: dataType,
          resid,
        })
      }
      stack[stack.length - 1].children.push(node)
      stack.push(node)
      r.seek(start + chunkSize)
      continue
    }
    if (type === RES_XML_END_ELEMENT) {
      if (stack.length > 1) stack.pop()
      r.seek(start + chunkSize)
      continue
    }
    if (type === RES_XML_CDATA) {
      r.seek(start + 16)
      const idx = r.i32()
      if (idx >= 0 && stack.length) {
        stack[stack.length - 1].text = (stack[stack.length - 1].text || '') + (strings[idx] || '')
      }
      r.seek(start + chunkSize)
      continue
    }
    r.seek(start + chunkSize)
  }

  return root.children[0] ?? root
}

export function findNodes(node: AxmlNode, name: string, acc: AxmlNode[] = []): AxmlNode[] {
  if (node.name === name) acc.push(node)
  for (const c of node.children) findNodes(c, name, acc)
  return acc
}

export function attr(node: AxmlNode, ...keys: string[]) {
  for (const k of keys) {
    if (node.attrs[k] !== undefined && node.attrs[k] !== '') return node.attrs[k]
  }
  return ''
}

export function axmlToPretty(node: AxmlNode, indent = 0): string {
  if (node.name === '#root') return node.children.map((c) => axmlToPretty(c, indent)).join('\n')
  const pad = '  '.repeat(indent)
  const attrs = Object.entries(node.attrs)
    .filter(([k]) => k.includes(':') || !Object.keys(node.attrs).some((x) => x.endsWith(':' + k)))
    .map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
    .join(' ')
  if (!node.children.length && !node.text) {
    return `${pad}<${node.name}${attrs ? ' ' + attrs : ''} />`
  }
  const inner = node.children.map((c) => axmlToPretty(c, indent + 1)).join('\n')
  const text = node.text ? `${pad}  ${node.text}\n` : ''
  return `${pad}<${node.name}${attrs ? ' ' + attrs : ''}>\n${text}${inner}\n${pad}</${node.name}>`
}
