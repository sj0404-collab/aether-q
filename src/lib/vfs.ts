export type VNode = {
  type: 'file' | 'dir'
  name: string
  path: string
  size: number
  mtime: number
  mode: string
  content?: Uint8Array
  children?: Record<string, VNode>
}

function now() {
  return Date.now()
}

function split(path: string) {
  return path.split('/').filter(Boolean)
}

export class VirtualFs {
  root: VNode = {
    type: 'dir',
    name: '',
    path: '/',
    size: 0,
    mtime: now(),
    mode: 'drwxr-xr-x',
    children: {},
  }

  mkdirp(path: string) {
    const parts = split(path)
    let node = this.root
    let cur = ''
    for (const p of parts) {
      cur += '/' + p
      if (!node.children) node.children = {}
      if (!node.children[p]) {
        node.children[p] = {
          type: 'dir',
          name: p,
          path: cur,
          size: 0,
          mtime: now(),
          mode: 'drwxr-xr-x',
          children: {},
        }
      }
      node = node.children[p]
    }
    return node
  }

  writeFile(path: string, content: Uint8Array | string, mode = '-rw-r--r--') {
    const parts = split(path)
    const name = parts.pop()!
    const dir = this.mkdirp('/' + parts.join('/'))
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content
    const full = '/' + [...parts, name].join('/')
    dir.children = dir.children || {}
    dir.children[name] = {
      type: 'file',
      name,
      path: full,
      size: data.byteLength,
      mtime: now(),
      mode,
      content: data,
    }
    return dir.children[name]
  }

  readFile(path: string): Uint8Array | null {
    const n = this.stat(path)
    if (!n || n.type !== 'file' || !n.content) return null
    return n.content
  }

  readText(path: string) {
    const b = this.readFile(path)
    return b ? new TextDecoder().decode(b) : null
  }

  stat(path: string): VNode | null {
    if (path === '/' || path === '') return this.root
    const parts = split(path)
    let node: VNode | undefined = this.root
    for (const p of parts) {
      node = node?.children?.[p]
      if (!node) return null
    }
    return node
  }

  list(path: string): VNode[] {
    const n = this.stat(path)
    if (!n || n.type !== 'dir' || !n.children) return []
    return Object.values(n.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  rm(path: string) {
    const parts = split(path)
    const name = parts.pop()
    if (!name) return
    const dir = this.stat('/' + parts.join('/'))
    if (dir?.children) delete dir.children[name]
  }

  tree(path = '/', depth = 4, prefix = ''): string[] {
    const n = this.stat(path)
    if (!n) return []
    const lines: string[] = []
    if (path === '/') lines.push('/')
    const kids = n.children ? Object.values(n.children) : []
    kids.forEach((k, i) => {
      const last = i === kids.length - 1
      const branch = last ? '└─ ' : '├─ '
      const mark = k.type === 'dir' ? k.name + '/' : k.name
      lines.push(prefix + branch + mark)
      if (k.type === 'dir' && depth > 0) {
        lines.push(...this.tree(k.path, depth - 1, prefix + (last ? '   ' : '│  ')))
      }
    })
    return lines
  }

  dumpMeta(): object {
    const walk = (n: VNode): object => {
      if (n.type === 'file') {
        return { type: 'file', size: n.size, mtime: n.mtime, mode: n.mode }
      }
      const children: Record<string, object> = {}
      for (const [k, v] of Object.entries(n.children || {})) children[k] = walk(v)
      return { type: 'dir', mtime: n.mtime, children }
    }
    return walk(this.root)
  }
}

export function seedAndroidFs(fs: VirtualFs, opts?: { serial?: string }) {
  const serial = opts?.serial ?? 'AETHERQ10A64'
  const dirs = [
    '/system',
    '/system/bin',
    '/system/lib64',
    '/system/lib64/hw',
    '/system/etc',
    '/system/etc/permissions',
    '/system/etc/security',
    '/system/usr',
    '/system/usr/share',
    '/system/fonts',
    '/system/framework',
    '/system/app',
    '/system/priv-app',
    '/system/media',
    '/system/media/audio',
    '/system/media/audio/ui',
    '/system/media/audio/ringtones',
    '/system/media/audio/notifications',
    '/vendor',
    '/vendor/lib64',
    '/vendor/etc',
    '/vendor/firmware',
    '/data',
    '/data/app',
    '/data/data',
    '/data/dalvik-cache/arm64',
    '/data/misc',
    '/data/misc/wifi',
    '/data/system',
    '/data/system/users/0',
    '/data/local/tmp',
    '/data/media/0',
    '/data/media/0/Download',
    '/data/media/0/DCIM/Camera',
    '/data/media/0/Pictures',
    '/data/media/0/Music',
    '/data/media/0/Ringtones',
    '/data/media/0/Android/data',
    '/cache',
    '/mnt',
    '/mnt/sdcard',
    '/storage',
    '/storage/emulated/0',
    '/storage/emulated/0/Download',
    '/proc',
    '/proc/sys/kernel',
    '/sys',
    '/sys/class',
    '/sys/devices',
    '/dev',
    '/dev/socket',
    '/apex',
    '/apex/com.android.runtime',
    '/config',
    '/odm',
    '/product',
    '/product/etc',
  ]
  dirs.forEach((d) => fs.mkdirp(d))

  const buildProp = [
    'ro.product.model=Aether Q',
    'ro.product.brand=Aether',
    'ro.product.name=aetherq',
    'ro.product.device=aetherq',
    'ro.product.manufacturer=Aether Labs',
    'ro.product.cpu.abi=arm64-v8a',
    'ro.product.cpu.abilist=arm64-v8a',
    'ro.product.cpu.abilist64=arm64-v8a',
    'ro.arch=arm64',
    'ro.board.platform=aether-q',
    'ro.build.version.release=10',
    'ro.build.version.sdk=29',
    'ro.build.version.codename=REL',
    'ro.build.version.security_patch=2026-10-05',
    'ro.build.type=userdebug',
    'ro.build.tags=release-keys',
    'ro.build.display.id=AetherQ-10-QP1A.290105.004',
    'ro.build.id=QP1A.290105.004',
    'ro.build.fingerprint=Aether/aetherq/aetherq:10/QP1A.290105.004/20261005:userdebug/release-keys',
    'ro.hardware=aether',
    'ro.hardware.chipname=AETHER-Q-A64',
    'ro.boot.hardware=aether',
    'ro.debuggable=1',
    'ro.secure=0',
    'ro.adb.secure=0',
    'ro.kernel.qemu=1',
    'ro.kernel.qemu.gles=1',
    'ro.opengles.version=196610',
    'persist.sys.timezone=UTC',
    'persist.sys.language=en',
    'persist.sys.country=US',
    'persist.sys.locale=en-US',
    'dalvik.vm.isa.arm64.variant=generic',
    'dalvik.vm.isa.arm64.features=default',
    'dalvik.vm.heapsize=512m',
    'dalvik.vm.heapgrowthlimit=256m',
    'ro.config.ringtone=AetherPulse.ogg',
    'ro.config.notification_sound=AetherPing.ogg',
    'wifi.interface=wlan0',
    `ro.serialno=${serial}`,
    'ro.bootmode=emulator',
  ].join('\n') + '\n'

  fs.writeFile('/system/build.prop', buildProp)
  fs.writeFile('/default.prop', 'ro.secure=0\nro.debuggable=1\npersist.sys.usb.config=adb\n')
  fs.writeFile('/proc/version', 'Linux version 4.14.180-aetherq-gqemu (builder@aether) (Android clang 8.0.7) #1 SMP PREEMPT Wed Oct 5 12:00:00 UTC 2026\n')
  fs.writeFile(
    '/proc/cpuinfo',
    [
      'processor\t: 0',
      'BogoMIPS\t: 48.00',
      'Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp',
      'CPU implementer\t: 0x41',
      'CPU architecture: 8',
      'CPU variant\t: 0x0',
      'CPU part\t: 0xd03',
      'CPU revision\t: 4',
      '',
      'processor\t: 1',
      'BogoMIPS\t: 48.00',
      'Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp',
      'CPU implementer\t: 0x41',
      'CPU architecture: 8',
      'CPU variant\t: 0x0',
      'CPU part\t: 0xd03',
      'CPU revision\t: 4',
      '',
      'processor\t: 2',
      'BogoMIPS\t: 48.00',
      'Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp',
      'CPU implementer\t: 0x41',
      'CPU architecture: 8',
      'CPU variant\t: 0x0',
      'CPU part\t: 0xd03',
      'CPU revision\t: 4',
      '',
      'processor\t: 3',
      'BogoMIPS\t: 48.00',
      'Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp',
      'CPU implementer\t: 0x41',
      'CPU architecture: 8',
      'CPU variant\t: 0x0',
      'CPU part\t: 0xd03',
      'CPU revision\t: 4',
      '',
      'Hardware\t: Aether Q QEMU WASM',
    ].join('\n') + '\n',
  )
  fs.writeFile(
    '/proc/meminfo',
    ['MemTotal:        2097152 kB', 'MemFree:         1048576 kB', 'MemAvailable:    1572864 kB', 'Buffers:           32768 kB', 'Cached:           524288 kB'].join(
      '\n',
    ) + '\n',
  )
  fs.writeFile('/sys/class/android_usb/android0/iSerial', serial + '\n')
  fs.writeFile('/system/etc/hosts', '127.0.0.1 localhost\n::1 localhost\n')
  fs.writeFile(
    '/system/etc/permissions/handheld_core_hardware.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n<permissions>\n  <feature name="android.hardware.touchscreen"/>\n  <feature name="android.hardware.wifi"/>\n  <feature name="android.hardware.audio.output"/>\n  <feature name="android.hardware.microphone"/>\n  <feature name="android.hardware.location"/>\n  <feature name="android.software.webview"/>\n</permissions>\n',
  )
  fs.writeFile(
    '/data/system/packages.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n<packages>\n  <version sdkVersion="29" databaseVersion="10"/>\n</packages>\n',
  )
  fs.writeFile('/data/misc/wifi/wpa_supplicant.conf', 'ctrl_interface=wlan0\nupdate_config=1\n')
  fs.writeFile(
    '/init.rc',
    [
      'on early-init',
      '    mkdir /dev/socket 0755',
      '    start ueventd',
      '',
      'on init',
      '    hostname aetherq',
      '    mkdir /data 0771 system system',
      '',
      'on boot',
      '    class_start core',
      '    class_start main',
      '',
      'service zygote /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote',
      '    class main',
      '    socket zygote stream 660 root system',
      '    onrestart write /sys/power/state on',
      '',
      'service audioserver /system/bin/audioserver',
      '    class main',
      '    user audioserver',
      '',
      'service netd /system/bin/netd',
      '    class core',
      '    socket netd stream 0660 root system',
    ].join('\n') + '\n',
  )

  const bins = [
    'sh',
    'toybox',
    'app_process64',
    'dalvikvm64',
    'surfaceflinger',
    'audioserver',
    'cameraserver',
    'netd',
    'vold',
    'logd',
    'servicemanager',
    'hwservicemanager',
    'vndservicemanager',
    'zygote64',
    'adbd',
    'logcat',
    'pm',
    'am',
    'dumpsys',
    'getprop',
    'setprop',
    'iptables',
    'ip',
    'toolbox',
    'linker64',
  ]
  bins.forEach((b) => fs.writeFile(`/system/bin/${b}`, new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]), '-r-xr-xr-x'))

  const libs = [
    'libc.so',
    'libm.so',
    'libdl.so',
    'liblog.so',
    'libandroid.so',
    'libandroid_runtime.so',
    'libart.so',
    'libhwui.so',
    'libEGL.so',
    'libGLESv2.so',
    'libGLESv3.so',
    'libOpenSLES.so',
    'libaaudio.so',
    'libjnigraphics.so',
    'libmediandk.so',
    'libcamera2ndk.so',
    'libneuralnetworks.so',
    'libvulkan.so',
    'libwebviewchromium.so',
    'libttscompat.so',
  ]
  libs.forEach((b) => fs.writeFile(`/system/lib64/${b}`, new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]), '-rw-r--r--'))

  fs.writeFile('/system/framework/framework.jar', 'PK\u0003\u0004 framework stub')
  fs.writeFile('/system/framework/ext.jar', 'PK\u0003\u0004 ext stub')
  fs.writeFile('/system/framework/telephony-common.jar', 'PK\u0003\u0004 telephony stub')
  fs.writeFile('/system/framework/services.jar', 'PK\u0003\u0004 services stub')
  fs.writeFile('/system/framework/boot.art', new Uint8Array([0x64, 0x65, 0x79, 0x0a]))
  fs.writeFile('/system/framework/arm64/boot.oat', new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]))
}
