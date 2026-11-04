import { parseApk, type ApkPackage } from './apk'
import { Arm64Vm } from './vm'
import { DalvikVm } from './dalvik'
import { VirtualFs, seedAndroidFs } from './vfs'
import { logcat } from './logcat'
import { props } from './props'
import { audio } from './audio'
import { tts } from './tts'
import { net } from './network'
import { extractLayouts, type InflatedView } from './layout'
import { idbGet, idbSet, idbDel } from './idb'

export type Process = {
  pid: number
  uid: number
  name: string
  pkg: string
  state: 'R' | 'S' | 'D' | 'Z'
  threads: number
  rss: number
  started: number
}

export type ActivityRecord = {
  pkg: string
  activity: string
  state: 'created' | 'started' | 'resumed' | 'paused' | 'stopped' | 'destroyed'
  task: number
}

export type NotificationItem = {
  id: number
  pkg: string
  title: string
  body: string
  at: number
}

export type InstalledMeta = {
  id: string
  fileName: string
  packageName: string
  label: string
  versionName: string
  versionCode: string
  size: number
  installedAt: number
  iconPath: string
  launcher: string
  minSdk: number
  targetSdk: number
  frameworks: string[]
}

export type GuestApp = {
  pkg: ApkPackage
  layouts: { path: string; root: InflatedView | null; error?: string }[]
  jsBundle?: string
  compose: boolean
  reactNative: boolean
  kotlin: boolean
}

const SYSTEM_APPS: { id: string; label: string; pkg: string; color: string; icon: string }[] = [
  { id: 'dialer', label: 'Phone', pkg: 'com.android.dialer', color: '#22c55e', icon: 'phone' },
  { id: 'messages', label: 'Messages', pkg: 'com.android.mms', color: '#38bdf8', icon: 'message' },
  { id: 'chrome', label: 'Chrome', pkg: 'com.android.chrome', color: '#60a5fa', icon: 'globe' },
  { id: 'camera', label: 'Camera', pkg: 'com.android.camera2', color: '#a1a1aa', icon: 'camera' },
  { id: 'photos', label: 'Photos', pkg: 'com.google.android.apps.photos', color: '#f472b6', icon: 'image' },
  { id: 'clock', label: 'Clock', pkg: 'com.android.deskclock', color: '#818cf8', icon: 'clock' },
  { id: 'settings', label: 'Settings', pkg: 'com.android.settings', color: '#94a3b8', icon: 'settings' },
  { id: 'files', label: 'Files', pkg: 'com.android.documentsui', color: '#fbbf24', icon: 'folder' },
  { id: 'play', label: 'Play Store', pkg: 'com.android.vending', color: '#4ade80', icon: 'store' },
  { id: 'contacts', label: 'Contacts', pkg: 'com.android.contacts', color: '#2dd4bf', icon: 'users' },
  { id: 'calculator', label: 'Calculator', pkg: 'com.android.calculator2', color: '#fb923c', icon: 'calc' },
  { id: 'calendar', label: 'Calendar', pkg: 'com.android.calendar', color: '#f87171', icon: 'cal' },
  { id: 'youtube', label: 'YouTube', pkg: 'com.google.android.youtube', color: '#ef4444', icon: 'yt' },
  { id: 'maps', label: 'Maps', pkg: 'com.google.android.apps.maps', color: '#34d399', icon: 'map' },
  { id: 'tts', label: 'Speech', pkg: 'com.google.android.tts', color: '#c084fc', icon: 'mic' },
  { id: 'terminal', label: 'Shell', pkg: 'com.aether.terminal', color: '#3dd6c6', icon: 'term' },
]

export class AndroidRuntime {
  fs = new VirtualFs()
  vm = new Arm64Vm()
  art = new DalvikVm()
  bootStage = 0
  booted = false
  booting = false
  bootLog: { t: number; msg: string }[] = []
  processes: Process[] = []
  activities: ActivityRecord[] = []
  notifications: NotificationItem[] = []
  packages = new Map<string, GuestApp>()
  battery = 87
  charging = true
  brightness = 0.72
  volume = 0.7
  wifi = true
  airplane = false
  bluetooth = false
  location = true
  dnd = false
  rotationLocked = true
  serial = 'AETHERQ10A64'
  uptime0 = Date.now()
  listeners = new Set<() => void>()
  foreground: { kind: 'launcher' | 'app' | 'system'; id: string } = { kind: 'launcher', id: 'home' }
  lastError = ''
  screenOn = true
  locked = true
  pin = '0000'
  bootAnim = 0

  constructor() {
    seedAndroidFs(this.fs, { serial: this.serial })
    this.vm.fs = this.fs
    this.seedSystemProcesses()
  }

  on(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  emit() {
    this.listeners.forEach((f) => f())
  }

  log(msg: string, tag = 'init') {
    this.bootLog.push({ t: Date.now(), msg })
    logcat.i(tag, msg)
    this.emit()
  }

  seedSystemProcesses() {
    const names = [
      'init',
      'ueventd',
      'logd',
      'servicemanager',
      'hwservicemanager',
      'vndservicemanager',
      'vold',
      'netd',
      'zygote64',
      'audioserver',
      'cameraserver',
      'surfaceflinger',
      'system_server',
      'mediaserver',
      'drmserver',
      'keystore',
      'gatekeeperd',
      'adbd',
      'wificond',
      'statsd',
      'incidentd',
      'installd',
      'lmkd',
      'prng_seeder',
      'android.hardware.audio@2.0-service',
      'android.hardware.graphics.composer@2.1-service',
      'com.android.systemui',
      'com.android.launcher3',
      'com.android.phone',
      'com.android.nfc',
      'webview_zygote64',
    ]
    this.processes = names.map((name, i) => ({
      pid: i === 0 ? 1 : 100 + i,
      uid: name.startsWith('com.') ? 10000 + i : i < 8 ? 0 : 1000,
      name,
      pkg: name.startsWith('com.') ? name : 'system',
      state: 'S' as const,
      threads: name === 'system_server' ? 84 : name === 'zygote64' ? 12 : 1 + (i % 4),
      rss: name === 'system_server' ? 180000 : 4000 + i * 350,
      started: Date.now() - 1000,
    }))
  }

  async boot() {
    if (this.booted || this.booting) return
    this.booting = true
    this.bootStage = 0
    this.locked = true
    const stages = [
      { t: 80, tag: 'bootloader', msg: 'Aether Q Boot ROM  ·  ARM64-v8a  ·  EL3' },
      { t: 140, tag: 'bootloader', msg: 'Loading kernel Image (4.14.180-aetherq) from /boot' },
      { t: 180, tag: 'kernel', msg: 'Linux version 4.14.180-aetherq (builder@aether) (Android clang 8.0.7)' },
      { t: 220, tag: 'kernel', msg: 'CPU0: AArch64 Processor [41d034]  SMP  4 cores  @ QEMU-WASM' },
      { t: 260, tag: 'kernel', msg: 'Memory: 2048MB RAM  ·  CMA 64MB  ·  ION heaps ready' },
      { t: 300, tag: 'init', msg: 'init first stage  /init.rc' },
      { t: 340, tag: 'ueventd', msg: 'ueventd started, coldboot done' },
      { t: 390, tag: 'init', msg: 'mount /system /vendor /data /cache  (ext4 overlay on VFS)' },
      { t: 430, tag: 'selinux', msg: 'SELinux: permissive (emulator)' },
      { t: 480, tag: 'logd', msg: 'logd started, ring buffer 256K' },
      { t: 520, tag: 'servicemanager', msg: 'servicemanager / hwservicemanager / vndservicemanager' },
      { t: 580, tag: 'vold', msg: 'vold: emulated storage /storage/emulated/0' },
      { t: 640, tag: 'zygote', msg: 'Zygote64 forked, preloading boot.art (arm64)' },
      { t: 720, tag: 'art', msg: 'Android Runtime 10 / API 29  ·  JIT + AOT profiles' },
      { t: 800, tag: 'surfaceflinger', msg: 'SurfaceFlinger 2.0  ·  1080x1920  60Hz  GLES 3.2 (WebGL)' },
      { t: 860, tag: 'audioserver', msg: 'audioserver  ·  OpenSL ES + AAudio  ·  WebAudio sink' },
      { t: 920, tag: 'netd', msg: 'netd: wlan0 UP  10.0.2.15/24  gw 10.0.2.2  dns 8.8.8.8' },
      { t: 980, tag: 'system_server', msg: 'SystemServer: PackageManager, ActivityManager, WindowManager' },
      { t: 1040, tag: 'PackageManager', msg: 'Scanning /system/app /system/priv-app /data/app' },
      { t: 1100, tag: 'ActivityManager', msg: 'Start proc com.android.systemui for service' },
      { t: 1160, tag: 'ActivityManager', msg: 'Start proc com.android.launcher3 for activity' },
      { t: 1220, tag: 'boot', msg: 'sys.boot_completed=1  ·  Android 10 Q ready' },
    ]
    for (const s of stages) {
      await delay(s.t)
      this.bootStage++
      this.log(s.msg, s.tag)
    }
    props.set('sys.boot_completed', '1')
    props.set('dev.bootcomplete', '1')
    this.vm.emit('boot', 'guest kernel online, userspace Android 10')
    this.booted = true
    this.booting = false
    audio.bootChime()
    this.emit()
    await this.restorePackages()
  }

  spawn(name: string, pkg: string) {
    const pid = logcat.nextPid()
    const p: Process = {
      pid,
      uid: 10100 + (this.processes.length % 90),
      name,
      pkg,
      state: 'R',
      threads: 8,
      rss: 24000,
      started: Date.now(),
    }
    this.processes.push(p)
    logcat.i('Zygote', `Process ${pid} created for ${pkg}`)
    this.emit()
    return p
  }

  async installApk(file: File | { name: string; data: ArrayBuffer }) {
    const name = 'name' in file && typeof file.name === 'string' ? file.name : 'app.apk'
    const data = file instanceof File ? await file.arrayBuffer() : file.data
    this.log(`pm install -t -r ${name} (${(data.byteLength / 1048576).toFixed(2)} MB)`, 'PackageManager')
    const pkg = await parseApk(name, data)
    if (pkg.minSdk > 29) {
      logcat.w('PackageManager', `${pkg.packageName} minSdk ${pkg.minSdk} > 29 — installing anyway (compat)`)
    }
    const layouts = await extractLayouts(pkg.zip)
    let jsBundle: string | undefined
    const bundleName = pkg.assets.find((a) => /index\.(android|bundle).*(\.js|)$/i.test(a) || a.endsWith('index.android.bundle'))
    if (bundleName) {
      const f = pkg.zip.file(bundleName)
      if (f) {
        const txt = await f.async('string')
        jsBundle = txt.slice(0, 250000)
      }
    }
    if (pkg.mainDex) this.art.loadDex(pkg.mainDex)
    const arm64 = pkg.nativeLibs.filter((n) => n.abi === 'arm64-v8a')
    for (const lib of arm64.slice(0, 12)) {
      const f = pkg.zip.file(lib.path)
      if (!f) continue
      const buf = await f.async('arraybuffer')
      this.fs.writeFile(`/data/app/${pkg.packageName}-1/lib/arm64/${lib.path.split('/').pop()}`, new Uint8Array(buf), '-rwxr-xr-x')
      try {
        this.vm.loadElf(buf, lib.path)
      } catch (e) {
        logcat.w('linker64', `load ${lib.path}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    this.fs.writeFile(`/data/app/${pkg.packageName}-1/base.apk`, new Uint8Array(data), '-rw-r--r--')
    this.fs.mkdirp(`/data/data/${pkg.packageName}/cache`)
    this.fs.mkdirp(`/data/data/${pkg.packageName}/files`)
    this.fs.mkdirp(`/data/data/${pkg.packageName}/shared_prefs`)
    this.fs.mkdirp(`/data/data/${pkg.packageName}/code_cache`)
    const guest: GuestApp = {
      pkg,
      layouts,
      jsBundle,
      compose: pkg.frameworks.compose,
      reactNative: pkg.frameworks.reactNative,
      kotlin: pkg.frameworks.kotlin,
    }
    this.packages.set(pkg.packageName, guest)
    await this.persistMeta()
    await idbSet('apk:' + pkg.packageName, data)
    logcat.i('PackageManager', `Success: package ${pkg.packageName} installed  v${pkg.versionName} (${pkg.versionCode})`)
    audio.installOk()
    this.notify(pkg.packageName, 'Package installer', `${pkg.label} installed`)
    this.emit()
    return guest
  }

  async uninstall(packageName: string) {
    const g = this.packages.get(packageName)
    if (g?.pkg.iconUrl) URL.revokeObjectURL(g.pkg.iconUrl)
    this.packages.delete(packageName)
    this.fs.rm(`/data/app/${packageName}-1`)
    await idbDel('apk:' + packageName)
    await this.persistMeta()
    logcat.i('PackageManager', `Success: package ${packageName} removed`)
    this.emit()
  }

  async persistMeta() {
    const list: InstalledMeta[] = [...this.packages.values()].map((g) => ({
      id: g.pkg.id,
      fileName: g.pkg.fileName,
      packageName: g.pkg.packageName,
      label: g.pkg.label,
      versionName: g.pkg.versionName,
      versionCode: g.pkg.versionCode,
      size: g.pkg.size,
      installedAt: g.pkg.installedAt,
      iconPath: g.pkg.iconPath,
      launcher: g.pkg.launcher,
      minSdk: g.pkg.minSdk,
      targetSdk: g.pkg.targetSdk,
      frameworks: Object.entries(g.pkg.frameworks)
        .filter(([, v]) => v)
        .map(([k]) => k),
    }))
    await idbSet('packages-meta', list)
  }

  async restorePackages() {
    const meta = await idbGet<InstalledMeta[]>('packages-meta')
    if (!meta?.length) return
    for (const m of meta) {
      const data = await idbGet<ArrayBuffer>('apk:' + m.packageName)
      if (!data) continue
      try {
        await this.installApk({ name: m.fileName, data })
      } catch (e) {
        logcat.e('PackageManager', `restore ${m.packageName}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  launch(packageName: string) {
    const g = this.packages.get(packageName)
    if (!g) {
      this.foreground = { kind: 'system', id: packageName }
      this.emit()
      return
    }
    const act = g.pkg.launcher || g.pkg.activities[0]?.name || g.pkg.packageName + '.MainActivity'
    const full = act.startsWith('.') ? g.pkg.packageName + act : act
    const proc = this.spawn(full, g.pkg.packageName)
    logcat.i('ActivityTaskManager', `START u0 {act=${full}} from uid 1000`)
    if (g.pkg.mainDex) this.art.loadDex(g.pkg.mainDex)
    this.art.launchActivity(full)
    const jniLibs = this.vm.images.filter((i) => i.path.includes(g.pkg.packageName) || g.pkg.nativeLibs.some((n) => n.path === i.path))
    jniLibs.slice(0, 4).forEach((img) => {
      try {
        this.vm.runJniOnLoad(img)
      } catch (e) {
        logcat.w('linker64', String(e))
      }
    })
    this.activities = this.activities.map((a) => (a.state === 'resumed' ? { ...a, state: 'paused' } : a))
    this.activities.push({ pkg: g.pkg.packageName, activity: full, state: 'resumed', task: proc.pid })
    this.foreground = { kind: 'app', id: g.pkg.packageName }
    this.locked = false
    if (g.pkg.permissions.some((p) => p.name.includes('INTERNET')) && this.wifi) {
      logcat.i('ConnectivityService', `${g.pkg.packageName} granted INTERNET, wlan0 available`)
    }
    audio.tap()
    this.emit()
  }

  home() {
    this.activities = this.activities.map((a) => (a.state === 'resumed' ? { ...a, state: 'paused' } : a))
    this.foreground = { kind: 'launcher', id: 'home' }
    audio.tap()
    this.emit()
  }

  back() {
    audio.back()
    if (this.foreground.kind !== 'launcher') this.home()
    else this.emit()
  }

  notify(pkg: string, title: string, body: string) {
    const n = { id: Date.now(), pkg, title, body, at: Date.now() }
    this.notifications.unshift(n)
    if (this.notifications.length > 40) this.notifications.length = 40
    audio.notify()
    this.emit()
    return n
  }

  systemApps() {
    return SYSTEM_APPS
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export const android = new AndroidRuntime()
