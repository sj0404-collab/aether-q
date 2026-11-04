export const BUILD_PROPS: Record<string, string> = {
  'ro.product.model': 'Aether Q',
  'ro.product.brand': 'Aether',
  'ro.product.name': 'aetherq',
  'ro.product.device': 'aetherq',
  'ro.product.manufacturer': 'Aether Labs',
  'ro.product.cpu.abi': 'arm64-v8a',
  'ro.product.cpu.abilist': 'arm64-v8a',
  'ro.product.cpu.abilist64': 'arm64-v8a',
  'ro.arch': 'arm64',
  'ro.board.platform': 'aether-q',
  'ro.build.version.release': '10',
  'ro.build.version.sdk': '29',
  'ro.build.version.codename': 'REL',
  'ro.build.version.security_patch': '2026-10-05',
  'ro.build.type': 'userdebug',
  'ro.build.tags': 'release-keys',
  'ro.build.display.id': 'AetherQ-10-QP1A.290105.004',
  'ro.build.id': 'QP1A.290105.004',
  'ro.build.fingerprint': 'Aether/aetherq/aetherq:10/QP1A.290105.004/20261005:userdebug/release-keys',
  'ro.hardware': 'aether',
  'ro.hardware.chipname': 'AETHER-Q-A64',
  'ro.debuggable': '1',
  'ro.secure': '0',
  'ro.adb.secure': '0',
  'ro.kernel.qemu': '1',
  'dalvik.vm.heapsize': '512m',
  'persist.sys.locale': 'en-US',
  'persist.sys.timezone': 'UTC',
  'wifi.interface': 'wlan0',
  'ro.serialno': 'AETHERQ10A64',
  'ro.opengles.version': '196610',
  'ro.bootmode': 'emulator',
  'init.svc.zygote': 'running',
  'init.svc.audioserver': 'running',
  'init.svc.netd': 'running',
  'init.svc.surfaceflinger': 'running',
  'sys.boot_completed': '1',
  'dev.bootcomplete': '1',
}

export class PropertyStore {
  map: Record<string, string> = { ...BUILD_PROPS }

  get(key: string) {
    return this.map[key] ?? ''
  }
  set(key: string, value: string) {
    this.map[key] = value
  }
  dump() {
    return Object.entries(this.map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `[${k}]: [${v}]`)
      .join('\n')
  }
  filter(prefix: string) {
    return Object.entries(this.map)
      .filter(([k]) => k.includes(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `[${k}]: [${v}]`)
      .join('\n')
  }
}

export const props = new PropertyStore()
