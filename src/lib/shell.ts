import { android } from './runtime'
import { logcat } from './logcat'
import { props } from './props'
import { net } from './network'
import { formatBytes } from './binary'
import { tts } from './tts'
import { audio } from './audio'

export type ShellLine = { kind: 'in' | 'out' | 'err' | 'sys'; text: string }

export async function runCommand(raw: string): Promise<string> {
  const line = raw.trim()
  if (!line) return ''
  const [cmd, ...rest] = tokenize(line)
  const arg = rest.join(' ')
  const a0 = rest[0] || ''
  const a1 = rest[1] || ''
  switch (cmd) {
    case 'help':
      return [
        'AetherQ adb/linux shell — Android 10 arm64',
        'pm install | pm list packages | pm path | pm uninstall',
        'am start -n pkg/.Activity | am force-stop',
        'dumpsys activity|package|meminfo|battery|wifi|audio',
        'logcat [-d] [filter] | getprop [key] | setprop k v',
        'ps | top | ls [path] | cat | df | uname -a | id | whoami',
        'wm size | dumpsys window | input tap x y | input text',
        'ping host | curl url | ip addr | netstat',
        'settings get/put | toybox | getenforce | svc wifi',
        'pm grant | cmd overlay | cmd testharness',
        'tts say <text> | play notify|ringtone|alarm',
        'vm regs | vm step | vm images | art calls',
      ].join('\n')
    case 'echo':
      return arg
    case 'id':
      return 'uid=0(root) gid=0(root) groups=0(root),1004(input),1007(log) context=u:r:su:s0'
    case 'whoami':
      return 'root'
    case 'pwd':
      return '/data/local/tmp'
    case 'uname':
      return a0 === '-a'
        ? 'Linux aetherq 4.14.180-aetherq #1 SMP PREEMPT aarch64 Android'
        : 'Linux'
    case 'getenforce':
      return 'Permissive'
    case 'date':
      return new Date().toString()
    case 'uptime': {
      const s = Math.floor((Date.now() - android.uptime0) / 1000)
      return `up ${Math.floor(s / 60)} min,  ${android.processes.length} users,  load average: 0.42, 0.38, 0.31`
    }
    case 'df':
      return [
        'Filesystem     1K-blocks    Used Available Use%',
        '/dev/root        2097152  614400   1482752  30% /',
        '/system          1572864  890000    682864  57% /system',
        '/data            4194304  220000   3974304   6% /data',
        '/cache            262144    1024    261120   1% /cache',
        'overlay           524288   48000    476288  10% /storage/emulated',
      ].join('\n')
    case 'ps': {
      const head = 'USER      PID   PPID  VSIZE  RSS   WCHAN            ADDR S NAME'
      const rows = android.processes.map((p) => {
        const user = p.uid === 0 ? 'root' : p.uid === 1000 ? 'system' : `u0_a${p.uid - 10000}`
        return `${user.padEnd(9)} ${String(p.pid).padStart(5)}     1 ${String(p.rss * 4).padStart(6)} ${String(p.rss).padStart(5)}  SyS_epoll_wait     0 ${p.state} ${p.name}`
      })
      return [head, ...rows].join('\n')
    }
    case 'top':
      return runCommand('ps')
    case 'ls': {
      const path = a0 || '/'
      const nodes = android.fs.list(path)
      if (!nodes.length) {
        const n = android.fs.stat(path)
        if (!n) return `ls: ${path}: No such file or directory`
        return n.name
      }
      if (rest.includes('-l') || a0 === '-l') {
        const dir = a0 === '-l' ? a1 || '/' : path
        return android.fs
          .list(dir)
          .map((n) => `${n.mode} 1 root root ${String(n.size).padStart(8)} ${new Date(n.mtime).toISOString().slice(0, 16).replace('T', ' ')} ${n.name}`)
          .join('\n')
      }
      return nodes.map((n) => (n.type === 'dir' ? n.name + '/' : n.name)).join('\n')
    }
    case 'cat': {
      const t = android.fs.readText(a0)
      if (t == null) return `cat: ${a0}: No such file or directory`
      return t
    }
    case 'tree':
      return android.fs.tree(a0 || '/', 3).join('\n')
    case 'getprop':
      return a0 ? props.get(a0) : props.dump()
    case 'setprop':
      if (!a0) return 'usage: setprop <key> <value>'
      props.set(a0, rest.slice(1).join(' '))
      return ''
    case 'logcat': {
      if (a0 === '-c') {
        logcat.clear()
        return ''
      }
      const filter = a0 === '-d' ? a1 : a0
      return logcat.dump(filter)
    }
    case 'pm':
      return pm(rest)
    case 'am':
      return am(rest)
    case 'dumpsys':
      return dumpsys(a0, rest.slice(1).join(' '))
    case 'wm':
      if (a0 === 'size') return 'Physical size: 1080x1920\nOverride size: 1080x1920'
      if (a0 === 'density') return 'Physical density: 420\nOverride density: 420'
      return 'wm size|density'
    case 'svc':
      if (a0 === 'wifi') {
        android.wifi = a1 !== 'disable'
        android.emit()
        return android.wifi ? 'Wi-Fi enabled' : 'Wi-Fi disabled'
      }
      return 'svc wifi [enable|disable]'
    case 'settings':
      return `settings ${arg}`
    case 'input':
      return `input ${arg}  (injected into SurfaceFlinger)`
    case 'ping': {
      const host = a0 || '8.8.8.8'
      const url = host.startsWith('http') ? host : `https://${host.replace(/\/$/, '')}`
      const r = await net.ping(url.startsWith('https') ? url : 'https://www.google.com/generate_204')
      return `PING ${host}: ${r.ok ? r.ms + ' ms' : 'unreachable'} (via wlan0)`
    }
    case 'curl': {
      const url = a0
      if (!url) return 'usage: curl <url>'
      try {
        const { record, text } = await net.fetch(url)
        return `HTTP ${record.status}  ${record.ms}ms  ${formatBytes(record.bytes)}\n${text.slice(0, 4000)}`
      } catch (e) {
        return `curl: (${e instanceof Error ? e.message : String(e)})`
      }
    }
    case 'ip':
      return [
        '1: lo: <LOOPBACK,UP> mtu 65536',
        '    inet 127.0.0.1/8',
        '2: wlan0: <BROADCAST,MULTICAST,UP> mtu 1500',
        `    inet ${net.state.ip}/24 brd 10.0.2.255`,
        '    inet6 fe80::aether:q/64',
      ].join('\n')
    case 'netstat':
      return net.log
        .slice(0, 20)
        .map((r) => `tcp  ${r.ok ? 'ESTAB' : 'FAIL'}  ${r.method} ${r.url}  ${r.status}  ${r.ms}ms`)
        .join('\n') || 'no connections'
    case 'tts':
      if (a0 === 'say') {
        tts.speak(rest.slice(1).join(' '))
        return 'speaking'
      }
      return tts.voices.map((v) => `${v.name}  ${v.lang}`).join('\n') || 'no voices yet (unlock audio)'
    case 'play':
      if (a0 === 'ringtone') audio.ringtone()
      else if (a0 === 'alarm') audio.alarm()
      else if (a0 === 'notify') audio.notify()
      else audio.tap()
      return 'ok'
    case 'vm':
      if (a0 === 'regs') return android.vm.regs()
      if (a0 === 'images')
        return android.vm.images.map((i) => `${i.path} @0x${i.base.toString(16)} ${i.elf.machine}`).join('\n') || 'no images'
      if (a0 === 'step') return android.vm.stepOne()
      return `pc=${android.vm.cpu.pc.toString(16)} steps=${android.vm.cpu.steps} halted=${android.vm.cpu.halted}`
    case 'art':
      return android.art.traces.slice(-40).join('\n') || 'no traces'
    case 'clear':
      return '\x1bc'
    case 'exit':
      return 'bye'
    case 'toybox':
      return 'toybox 0.8.2-android  acpi base64 basename blkdiscard blockdev cal cat chattr chgrp chmod chown chroot chrt cksum clear comm cp cpio cut date dd df dirname dmesg du echo env expand factor fallocate false fdisk fgconsole find flock fmt free freeramdisk fsfreeze getconf getopt grep groups gunzip gzip head help hexdump hostname hwclock id ifconfig inotifyd insmod install ionice ioreq iotop kill killall ln log logger login losetup ls lsattr lsmod lsof lspci lsusb makedevs md5sum mkdir mkfifo mknod mkswap mktemp modinfo more mount mountpoint nbd-client nc netcat netstat nice nl nohup nproc nsenter od partprobe paste patch pgrep pidof ping pivot_root pkill pmap printenv printf ps pwd pwdx readahead readlink realpath reboot renice reset resize rev rfkill rm rmdir rmmod route rtcwake sed seq setfattr setsid sha1sum sha256sum shred sleep sort split stat strings stty swapoff swapon switch_root sync sysctl syslogd tac tail tar taskset tee telnet test time timeout top touch true truncate tty tunctl ulimit umount uname uniq unix2dos unlink unshare uptime usleep uudecode uuencode uuidgen vconfig vmstat w watch wc which who whoami xargs xxd yes zcat'
    default:
      if (android.fs.stat('/system/bin/' + cmd) || android.fs.stat('/system/bin/toybox')) {
        return `${cmd}: applet not fully wired (${arg})`
      }
      return `${cmd}: not found`
  }
}

function pm(args: string[]) {
  const sub = args[0]
  if (sub === 'list') {
    const guest = [...android.packages.values()].map((g) => `package:${g.pkg.packageName}`)
    const sys = android.systemApps().map((s) => `package:${s.pkg}`)
    return [...guest, ...sys].join('\n')
  }
  if (sub === 'path') {
    const p = android.packages.get(args[1])
    return p ? `package:/data/app/${p.pkg.packageName}-1/base.apk` : ''
  }
  if (sub === 'dump') {
    const p = android.packages.get(args[1])
    if (!p) return 'not found'
    return [
      `DUMP OF PACKAGE ${p.pkg.packageName}`,
      `  versionName=${p.pkg.versionName} versionCode=${p.pkg.versionCode}`,
      `  minSdk=${p.pkg.minSdk} targetSdk=${p.pkg.targetSdk}`,
      `  application=${p.pkg.applicationClass}`,
      `  activities=${p.pkg.activities.length} services=${p.pkg.services.length}`,
      `  flags=DEBUGGABLE[${p.pkg.debuggable}] ALLOW_BACKUP[${p.pkg.allowBackup}]`,
    ].join('\n')
  }
  if (sub === 'uninstall') {
    void android.uninstall(args[1])
    return 'Success'
  }
  if (sub === 'grant' || sub === 'revoke') return 'Success'
  return 'usage: pm list packages | path | dump | uninstall | install'
}

function am(args: string[]) {
  const sub = args[0]
  if (sub === 'start') {
    const nIdx = args.indexOf('-n')
    const comp = nIdx >= 0 ? args[nIdx + 1] : args[1]
    const pkg = (comp || '').split('/')[0]
    if (pkg) android.launch(pkg)
    return `Starting: Intent { cmp=${comp} }`
  }
  if (sub === 'force-stop') {
    android.processes = android.processes.filter((p) => p.pkg !== args[1])
    android.emit()
    return ''
  }
  if (sub === 'stack' || sub === 'dumpsys') return dumpsys('activity', '')
  return 'usage: am start -n pkg/.Act | force-stop'
}

function dumpsys(svc: string, _extra: string) {
  if (svc === 'activity' || svc === '') {
    return [
      'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)',
      `  Display #0 (activities from uid 0):`,
      ...android.activities.map((a) => `    * TaskRecord{${a.task}} ${a.pkg}/${a.activity} state=${a.state}`),
      android.activities.length ? '' : '    (no guest activities)',
      `  Proc #${android.processes.length}`,
    ].join('\n')
  }
  if (svc === 'package') return pm(['list'])
  if (svc === 'battery')
    return `Current Battery Service state:\n  AC powered: ${android.charging}\n  level: ${android.battery}\n  scale: 100\n  status: ${android.charging ? '2' : '3'}`
  if (svc === 'wifi')
    return `Wi-Fi is ${android.wifi ? 'enabled' : 'disabled'}\nmWifiInfo SSID: ${net.state.ssid} IP: ${net.state.ip}`
  if (svc === 'meminfo')
    return android.processes
      .slice()
      .sort((a, b) => b.rss - a.rss)
      .slice(0, 16)
      .map((p) => `${String(p.rss).padStart(8)}K  ${p.name}`)
      .join('\n')
  if (svc === 'audio') return `AudioPolicy:\n  volume music=${android.volume}\n  devices: speaker, earpiece, wired_headphone`
  if (svc === 'window') return 'WINDOW MANAGER DISPLAY CONTENTS\n  Display: mDisplayId=0  1080x1920  ROTATION_0'
  return `Can't find service: ${svc}`
}

function tokenize(s: string) {
  const out: string[] = []
  let cur = ''
  let q = ''
  for (const ch of s) {
    if (q) {
      if (ch === q) q = ''
      else cur += ch
    } else if (ch === '"' || ch === "'") q = ch
    else if (ch === ' ') {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}
