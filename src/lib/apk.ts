import JSZip from 'jszip'
import { parseAxml, findNodes, attr, axmlToPretty, type AxmlNode } from './axml'
import { parseArsc, lookupLabel, type ArscTable } from './arsc'
import { parseDex, scanFramework, type DexInfo } from './dex'
import { parseElf, type ElfInfo } from './elf'
import { crc32, formatBytes } from './binary'

export type ApkPermission = { name: string; maxSdk?: string }
export type ApkActivity = { name: string; exported: boolean; launcher: boolean; label: string; theme: string }
export type ApkService = { name: string; exported: boolean }
export type ApkReceiver = { name: string; exported: boolean }
export type ApkProvider = { name: string; authorities: string; exported: boolean }
export type ApkFeature = { name: string; required: boolean; glEs?: string }
export type ApkNativeLib = { path: string; abi: string; size: number; elf?: ElfInfo }
export type ApkCert = {
  path: string
  size: number
  sha256: string
  issuerGuess: string
}

export type ApkPackage = {
  id: string
  fileName: string
  size: number
  installedAt: number
  packageName: string
  versionName: string
  versionCode: string
  minSdk: number
  targetSdk: number
  compileSdk: string
  label: string
  applicationClass: string
  appComponentFactory: string
  debuggable: boolean
  allowBackup: boolean
  usesCleartext: boolean
  hardwareAccelerated: boolean
  extractNativeLibs: boolean
  iconPath: string
  iconUrl?: string
  roundIconPath: string
  permissions: ApkPermission[]
  activities: ApkActivity[]
  services: ApkService[]
  receivers: ApkReceiver[]
  providers: ApkProvider[]
  features: ApkFeature[]
  metaData: Record<string, string>
  launcher: string
  dexFiles: { name: string; size: number; info?: DexInfo }[]
  nativeLibs: ApkNativeLib[]
  assets: string[]
  files: { name: string; size: number; compressed: number; crc: number }[]
  certs: ApkCert[]
  frameworks: ReturnType<typeof scanFramework>
  manifestXml: string
  manifestNode: AxmlNode
  arsc?: ArscTable
  zip: JSZip
  raw: ArrayBuffer
  mainDex?: DexInfo
}

function boolish(v: string) {
  return v === 'true' || v === '1'
}

function sdkNum(v: string) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

async function sha256Hex(buf: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function pickIcon(files: string[]) {
  const dens = ['xxxhdpi', 'xxhdpi', 'xhdpi', 'hdpi', 'mdpi', 'anydpi']
  const names = ['ic_launcher.png', 'ic_launcher.webp', 'ic_launcher_foreground.png', 'icon.png']
  for (const d of dens) {
    for (const n of names) {
      const hit = files.find((f) => f.includes(`mipmap-${d}`) && f.endsWith(n))
      if (hit) return hit
    }
  }
  const any = files.find((f) => /mipmap-.*ic_launcher\.(png|webp)$/i.test(f))
  return any || files.find((f) => /ic_launcher\.(png|webp)$/i.test(f)) || ''
}

export async function parseApk(fileName: string, raw: ArrayBuffer): Promise<ApkPackage> {
  const zip = await JSZip.loadAsync(raw)
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  const files = await Promise.all(
    entries.map(async (f) => {
      const data = await f.async('uint8array')
      return {
        name: f.name,
        size: data.byteLength,
        compressed: (f as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize ?? data.byteLength,
        crc: crc32(data),
      }
    }),
  )
  files.sort((a, b) => a.name.localeCompare(b.name))
  const names = files.map((f) => f.name)

  const mfFile = zip.file('AndroidManifest.xml')
  if (!mfFile) throw new Error('APK is missing AndroidManifest.xml')
  const mfBuf = await mfFile.async('arraybuffer')
  const manifestNode = parseAxml(mfBuf)
  const manifestXml = axmlToPretty(manifestNode)

  const manifest = manifestNode.name === 'manifest' ? manifestNode : findNodes(manifestNode, 'manifest')[0] ?? manifestNode
  const application = findNodes(manifest, 'application')[0]
  const usesSdk = findNodes(manifest, 'uses-sdk')[0]

  let arsc: ArscTable | undefined
  const arscFile = zip.file('resources.arsc')
  if (arscFile) {
    try {
      arsc = parseArsc(await arscFile.async('arraybuffer'))
    } catch {
      arsc = undefined
    }
  }

  const packageName = attr(manifest, 'package') || 'unknown.package'
  const versionName = attr(manifest, 'android:versionName', 'versionName') || '1.0'
  const versionCode = attr(manifest, 'android:versionCode', 'versionCode') || '1'
  const minSdk = sdkNum(attr(usesSdk ?? manifest, 'android:minSdkVersion', 'minSdkVersion'))
  const targetSdk = sdkNum(attr(usesSdk ?? manifest, 'android:targetSdkVersion', 'targetSdkVersion'))
  const compileSdk = attr(manifest, 'android:compileSdkVersion', 'compileSdkVersion')
  const rawLabel = application ? attr(application, 'android:label', 'label') : ''
  const label = lookupLabel(arsc ?? { globalStrings: [], packages: [], values: {} }, rawLabel, packageName.split('.').pop() || packageName)

  const permissions = findNodes(manifest, 'uses-permission').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    maxSdk: attr(n, 'android:maxSdkVersion', 'maxSdkVersion') || undefined,
  }))

  const intentIsLauncher = (n: AxmlNode) => {
    const filters = findNodes(n, 'intent-filter')
    return filters.some((f) => {
      const actions = findNodes(f, 'action').map((a) => attr(a, 'android:name', 'name'))
      const cats = findNodes(f, 'category').map((c) => attr(c, 'android:name', 'name'))
      return actions.includes('android.intent.action.MAIN') && cats.includes('android.intent.category.LAUNCHER')
    })
  }

  const activities = findNodes(manifest, 'activity').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    exported: boolish(attr(n, 'android:exported', 'exported')),
    launcher: intentIsLauncher(n),
    label: attr(n, 'android:label', 'label'),
    theme: attr(n, 'android:theme', 'theme'),
  }))
  const launcherAct = activities.find((a) => a.launcher) || activities[0]
  const launcher = launcherAct?.name || ''

  const services = findNodes(manifest, 'service').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    exported: boolish(attr(n, 'android:exported', 'exported')),
  }))
  const receivers = findNodes(manifest, 'receiver').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    exported: boolish(attr(n, 'android:exported', 'exported')),
  }))
  const providers = findNodes(manifest, 'provider').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    authorities: attr(n, 'android:authorities', 'authorities'),
    exported: boolish(attr(n, 'android:exported', 'exported')),
  }))
  const features = findNodes(manifest, 'uses-feature').map((n) => ({
    name: attr(n, 'android:name', 'name'),
    required: attr(n, 'android:required', 'required') !== 'false',
    glEs: attr(n, 'android:glEsVersion', 'glEsVersion') || undefined,
  }))

  const metaData: Record<string, string> = {}
  if (application) {
    for (const n of findNodes(application, 'meta-data')) {
      const k = attr(n, 'android:name', 'name')
      const v = attr(n, 'android:value', 'value') || attr(n, 'android:resource', 'resource')
      if (k) metaData[k] = v
    }
  }

  const dexFiles: ApkPackage['dexFiles'] = []
  const dexNames = names.filter((n) => /^classes\d*\.dex$/i.test(n.split('/').pop() || ''))
  dexNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  let mainDex: DexInfo | undefined
  for (const n of dexNames) {
    const f = zip.file(n)
    if (!f) continue
    const buf = await f.async('arraybuffer')
    let info: DexInfo | undefined
    try {
      info = parseDex(buf, { maxClasses: n === 'classes.dex' ? 500 : 80, maxMethods: n === 'classes.dex' ? 3000 : 400 })
      if (!mainDex) mainDex = info
    } catch {
      info = undefined
    }
    dexFiles.push({ name: n, size: buf.byteLength, info })
  }

  const nativeLibs: ApkNativeLib[] = []
  const soFiles = names.filter((n) => n.startsWith('lib/') && n.endsWith('.so'))
  for (const n of soFiles) {
    const parts = n.split('/')
    const abi = parts[1] || 'unknown'
    const f = zip.file(n)
    if (!f) continue
    const buf = await f.async('arraybuffer')
    let elf: ElfInfo | undefined
    try {
      elf = parseElf(buf, n)
    } catch {
      elf = undefined
    }
    nativeLibs.push({ path: n, abi, size: buf.byteLength, elf })
  }

  const iconPath = pickIcon(names)
  let iconUrl: string | undefined
  if (iconPath) {
    const f = zip.file(iconPath)
    if (f) {
      const blob = await f.async('blob')
      if (blob.type.startsWith('image') || iconPath.endsWith('.png') || iconPath.endsWith('.webp')) {
        iconUrl = URL.createObjectURL(blob)
      }
    }
  }

  const certs: ApkCert[] = []
  for (const n of names.filter((x) => x.startsWith('META-INF/') && /\.(RSA|DSA|EC|SF)$/i.test(x))) {
    const f = zip.file(n)
    if (!f) continue
    const buf = await f.async('arraybuffer')
    certs.push({
      path: n,
      size: buf.byteLength,
      sha256: await sha256Hex(buf),
      issuerGuess: n,
    })
  }

  const allStrings = [
    ...(mainDex?.strings ?? []),
    ...dexFiles.flatMap((d) => d.info?.strings ?? []).slice(0, 4000),
  ]
  const allTypes = [
    ...(mainDex?.types ?? []),
    ...dexFiles.flatMap((d) => d.info?.types ?? []).slice(0, 2000),
  ]
  const classNames = dexFiles.flatMap((d) => d.info?.classes.map((c) => c.name) ?? [])
  const frameworks = scanFramework(allStrings, allTypes, classNames)

  const id = `${packageName}@${versionCode}-${crc32(new Uint8Array(raw.slice(0, 4096))).toString(16)}`

  return {
    id,
    fileName,
    size: raw.byteLength,
    installedAt: Date.now(),
    packageName,
    versionName,
    versionCode,
    minSdk,
    targetSdk,
    compileSdk,
    label,
    applicationClass: application ? attr(application, 'android:name', 'name') : '',
    appComponentFactory: application ? attr(application, 'android:appComponentFactory', 'appComponentFactory') : '',
    debuggable: application ? boolish(attr(application, 'android:debuggable', 'debuggable')) : false,
    allowBackup: application ? attr(application, 'android:allowBackup', 'allowBackup') !== 'false' : true,
    usesCleartext: application ? boolish(attr(application, 'android:usesCleartextTraffic', 'usesCleartextTraffic')) : false,
    hardwareAccelerated: application ? attr(application, 'android:hardwareAccelerated', 'hardwareAccelerated') !== 'false' : true,
    extractNativeLibs: application ? attr(application, 'android:extractNativeLibs', 'extractNativeLibs') !== 'false' : true,
    iconPath,
    iconUrl,
    roundIconPath: names.find((f) => /ic_launcher_round\.(png|webp)$/i.test(f)) || '',
    permissions,
    activities,
    services,
    receivers,
    providers,
    features,
    metaData,
    launcher,
    dexFiles,
    nativeLibs,
    assets: names.filter((n) => n.startsWith('assets/')),
    files,
    certs,
    frameworks,
    manifestXml,
    manifestNode,
    arsc,
    zip,
    raw,
    mainDex,
  }
}

export function apkSummary(pkg: ApkPackage) {
  const fw = Object.entries(pkg.frameworks)
    .filter(([, v]) => v)
    .map(([k]) => k)
  return [
    `${pkg.label} (${pkg.packageName})`,
    `v${pkg.versionName} (${pkg.versionCode})  minSdk=${pkg.minSdk} targetSdk=${pkg.targetSdk}`,
    `${pkg.activities.length} activities · ${pkg.services.length} services · ${pkg.permissions.length} permissions`,
    `${pkg.dexFiles.length} DEX · ${pkg.nativeLibs.length} native libs · ${formatBytes(pkg.size)}`,
    fw.length ? `frameworks: ${fw.join(', ')}` : 'frameworks: none detected',
  ].join('\n')
}
