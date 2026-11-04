import { useEffect, useRef, useState } from 'react'
import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { logcat, type LogLine } from '../lib/logcat'
import { net } from '../lib/network'
import { runCommand } from '../lib/shell'
import { formatBytes } from '../lib/binary'
import { audio } from '../lib/audio'
import { tts } from '../lib/tts'
import { DeviceFrame } from './DeviceFrame'
import {
  Cpu,
  HardDrive,
  Terminal,
  Package,
  Activity,
  FileCode2,
  Wifi,
  Upload,
} from 'lucide-react'

type Tab = 'install' | 'package' | 'logcat' | 'shell' | 'vm' | 'net' | 'proc' | 'fs'

export function Workbench() {
  useRuntime()
  const [tab, setTab] = useState<Tab>('install')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void android.boot()
  }, [])

  const install = async (file: File) => {
    setErr('')
    setBusy(`Parsing ${file.name}…`)
    try {
      await audio.unlock()
      tts.refreshVoices()
      const g = await android.installApk(file)
      setBusy('')
      setTab('package')
      android.launch(g.pkg.packageName)
    } catch (e) {
      setBusy('')
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
    { id: 'install', label: 'Install', icon: Upload },
    { id: 'package', label: 'APK', icon: Package },
    { id: 'logcat', label: 'Logcat', icon: FileCode2 },
    { id: 'shell', label: 'Shell', icon: Terminal },
    { id: 'vm', label: 'ARM64', icon: Cpu },
    { id: 'net', label: 'Net', icon: Wifi },
    { id: 'proc', label: 'PS', icon: Activity },
    { id: 'fs', label: 'VFS', icon: HardDrive },
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <aside className="lg:w-[420px] xl:w-[480px] p-6 lg:p-8 flex flex-col items-center justify-center">
        <DeviceFrame onDropApk={install} />
        <p className="text-[11px] text-white/35 mt-4 text-center max-w-sm">
          Drop an APK onto the device. ARM64 ELF, DEX, AndroidManifest, resources.arsc, Compose, RN bundles, TTS, WebAudio and guest HTTP run in this tab.
        </p>
      </aside>
      <main className="flex-1 min-w-0 border-t lg:border-t-0 lg:border-l border-white/8 bg-[#090b10]/80">
        <header className="px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.28em] uppercase text-teal-400/80">Aether Q Workbench</div>
            <h1 className="text-2xl font-semibold mt-0.5">Android 10 · arm64-v8a</h1>
            <div className="text-xs text-white/45 mt-1">
              QEMU-class guest in WASM-style JS · API 29 · 4× Cortex-A53 · 2 GB · GLES via WebGL · audio via WebAudio
            </div>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="shrink-0 px-4 py-2 rounded-full bg-teal-400 text-black text-sm font-medium"
          >
            Install APK
          </button>
          <input
            ref={input}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void install(f)
              e.target.value = ''
            }}
          />
        </header>
        <div className="px-4 flex gap-1 overflow-auto hide-scroll">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs ${tab === t.id ? 'bg-white/8 text-white' : 'text-white/45 hover:text-white'}`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="m-4 mt-0 rounded-2xl rounded-tl-none bg-black/35 border border-white/6 min-h-[520px] p-4">
          {busy && <div className="text-teal-300 text-sm mb-3">{busy}</div>}
          {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
          {tab === 'install' && <InstallPane onPick={() => input.current?.click()} />}
          {tab === 'package' && <PackagePane />}
          {tab === 'logcat' && <LogcatPane />}
          {tab === 'shell' && <HostShell />}
          {tab === 'vm' && <VmPane />}
          {tab === 'net' && <NetPane />}
          {tab === 'proc' && <ProcPane />}
          {tab === 'fs' && <FsPane />}
        </div>
      </main>
    </div>
  )
}

function InstallPane({ onPick }: { onPick: () => void }) {
  const apps = [...android.packages.values()]
  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {[
          { k: 'ISA', v: 'AArch64' },
          { k: 'API', v: '29 / Q' },
          { k: 'ABI', v: 'arm64-v8a' },
          { k: 'ART', v: 'DEX + JNI' },
          { k: 'Audio', v: audio.unlocked ? 'WebAudio live' : 'tap to unlock' },
          { k: 'Net', v: android.wifi ? 'wlan0 UP' : 'down' },
        ].map((c) => (
          <div key={c.k} className="rounded-xl bg-white/5 px-3 py-3">
            <div className="text-[10px] uppercase tracking-widest text-white/40">{c.k}</div>
            <div className="text-sm mt-1">{c.v}</div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onPick} className="w-full rounded-2xl border border-dashed border-white/15 py-10 text-white/60 hover:border-teal-400/50">
        Drop APK here or click to browse
      </button>
      <div className="mt-6 space-y-2">
        {apps.map((g) => (
          <div key={g.pkg.packageName} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
            {g.pkg.iconUrl ? <img src={g.pkg.iconUrl} className="w-9 h-9 rounded-lg" alt="" /> : <div className="w-9 h-9 rounded-lg bg-teal-700" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{g.pkg.label}</div>
              <div className="text-[11px] text-white/40 truncate">
                {g.pkg.packageName} · {formatBytes(g.pkg.size)}
              </div>
            </div>
            <button type="button" className="text-xs px-3 py-1 rounded-full bg-teal-400 text-black" onClick={() => android.launch(g.pkg.packageName)}>
              Open
            </button>
            <button type="button" className="text-xs px-3 py-1 rounded-full bg-white/10" onClick={() => void android.uninstall(g.pkg.packageName)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PackagePane() {
  const g = [...android.packages.values()][0] && android.packages.get(android.foreground.kind === 'app' ? android.foreground.id : [...android.packages.keys()][0])
  if (!g) return <div className="text-white/40 text-sm">Install an APK to inspect manifest, DEX, ELF.</div>
  const p = g.pkg
  return (
    <div className="space-y-4 text-sm">
      <div className="flex gap-3">
        {p.iconUrl && <img src={p.iconUrl} className="w-14 h-14 rounded-xl" alt="" />}
        <div>
          <div className="text-lg font-medium">{p.label}</div>
          <div className="text-white/50 text-xs">{p.packageName}</div>
          <div className="text-xs text-teal-300 mt-1">
            v{p.versionName} ({p.versionCode}) · min {p.minSdk} · target {p.targetSdk}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(p.frameworks)
          .filter(([, v]) => v)
          .map(([k]) => (
            <span key={k} className="px-2 py-0.5 rounded-full bg-teal-400/15 text-teal-200 text-[11px]">
              {k}
            </span>
          ))}
      </div>
      <Section title="Permissions">{p.permissions.map((x) => x.name).join('\n') || 'none'}</Section>
      <Section title="Activities">
        {p.activities.map((a) => `${a.launcher ? '[L] ' : ''}${a.name}`).join('\n')}
      </Section>
      <Section title="Native (ELF)">
        {p.nativeLibs
          .map((n) => `${n.path}  ${formatBytes(n.size)}  ${n.elf?.machine || ''}  ${n.elf?.isArm64 ? 'A64' : ''}`)
          .join('\n') || 'no .so'}
      </Section>
      <Section title="DEX">
        {p.dexFiles.map((d) => `${d.name}  ${formatBytes(d.size)}  classes=${d.info?.classCount ?? '?'} methods=${d.info?.methodCount ?? '?'}`).join('\n')}
      </Section>
      {p.nativeLibs.find((n) => n.elf?.disasm.length) && (
        <Section title="ARM64 disassembly (first .so .text)">
          {p.nativeLibs.find((n) => n.elf?.disasm.length)!.elf!.disasm.join('\n')}
        </Section>
      )}
      <Section title="AndroidManifest.xml">{p.manifestXml.slice(0, 6000)}</Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-white/40 mb-1">{title}</div>
      <pre className="term text-[11px] text-white/70 whitespace-pre-wrap bg-black/30 rounded-xl p-3 max-h-56 overflow-auto">{children}</pre>
    </div>
  )
}

function LogcatPane() {
  const [lines, setLines] = useState<LogLine[]>(logcat.lines.slice(-400))
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    return logcat.on((l) => {
      setLines((xs) => {
        const n = [...xs, l]
        return n.length > 800 ? n.slice(-800) : n
      })
    })
  }, [])
  useEffect(() => {
    box.current?.scrollTo(0, 9e9)
  }, [lines])
  const shown = filter ? lines.filter((l) => logcat.format(l).toLowerCase().includes(filter.toLowerCase())) : lines
  return (
    <div className="flex flex-col h-[560px]">
      <div className="flex gap-2 mb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter"
          className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-xs outline-none"
        />
        <button type="button" className="text-xs px-3 rounded-lg bg-white/10" onClick={() => { logcat.clear(); setLines([]) }}>
          clear
        </button>
      </div>
      <div ref={box} className="flex-1 overflow-auto term text-[11px]">
        {shown.map((l, i) => (
          <div key={i} style={{ color: logcat.color(l.level) }}>
            {logcat.format(l)}
          </div>
        ))}
      </div>
    </div>
  )
}

function HostShell() {
  const [hist, setHist] = useState<{ in: string; out: string }[]>([])
  const [cmd, setCmd] = useState('getprop ro.build.fingerprint')
  return (
    <div>
      <form
        className="flex gap-2 mb-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const out = await runCommand(cmd)
          setHist((h) => [...h, { in: cmd, out }])
        }}
      >
        <span className="term text-teal-400 pt-2">#</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} className="flex-1 bg-white/5 rounded-lg px-3 py-2 term text-xs outline-none" />
      </form>
      <div className="term text-[11px] space-y-3 max-h-[480px] overflow-auto">
        {hist.map((h, i) => (
          <div key={i}>
            <div className="text-teal-300"># {h.in}</div>
            <pre className="whitespace-pre-wrap text-white/70">{h.out}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function VmPane() {
  const [, bump] = useState(0)
  const img = android.vm.images[0]
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-white/10 text-xs"
          onClick={() => {
            android.vm.stepOne()
            bump((x) => x + 1)
          }}
        >
          Step
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-white/10 text-xs"
          onClick={() => {
            if (img) android.vm.execute(android.vm.cpu.pc || img.entry, 5000)
            bump((x) => x + 1)
          }}
        >
          Run 5k
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-teal-400 text-black text-xs"
          onClick={() => {
            if (img) android.vm.runJniOnLoad(img)
            bump((x) => x + 1)
          }}
        >
          JNI_OnLoad
        </button>
      </div>
      <Section title="CPU">{android.vm.regs()}</Section>
      <Section title="Images">
        {android.vm.images.map((i) => `${i.path} @ 0x${i.base.toString(16)} entry 0x${i.entry.toString(16)} ${i.elf.machine}`).join('\n') ||
          'no ELF mapped — install an APK with lib/arm64-v8a'}
      </Section>
      <Section title="Syscalls">{android.vm.events.slice(0, 30).map((e) => `${e.kind}  ${e.text}`).join('\n')}</Section>
      <Section title="ART bridges">{android.art.traces.slice(-40).join('\n')}</Section>
    </div>
  )
}

function NetPane() {
  const [url, setUrl] = useState('https://httpbin.org/get')
  const [body, setBody] = useState('')
  return (
    <div>
      <form
        className="flex gap-2 mb-3"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const r = await net.fetch(url)
            setBody(`HTTP ${r.record.status}  ${r.record.ms}ms  ${formatBytes(r.record.bytes)}\n${r.text.slice(0, 5000)}`)
          } catch (err) {
            setBody(String(err))
          }
        }}
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-xs outline-none" />
        <button className="px-3 rounded-lg bg-teal-400 text-black text-xs">GET</button>
      </form>
      <pre className="term text-[11px] whitespace-pre-wrap text-white/70 max-h-40 overflow-auto mb-3">{body}</pre>
      <Section title="wlan0 log">
        {net.log.map((r) => `${r.method} ${r.status} ${r.ms}ms  ${r.url}  ${r.error || formatBytes(r.bytes)}`).join('\n')}
      </Section>
    </div>
  )
}

function ProcPane() {
  return (
    <pre className="term text-[11px] text-white/70 overflow-auto max-h-[520px]">
      {android.processes
        .map((p) => `${String(p.pid).padStart(5)}  ${p.state}  ${String(p.rss).padStart(7)}K  ${p.name}`)
        .join('\n')}
    </pre>
  )
}

function FsPane() {
  const [path, setPath] = useState('/')
  const nodes = android.fs.list(path)
  const file = android.fs.stat(path)
  return (
    <div className="text-sm">
      <div className="term text-teal-300 text-xs mb-2">{path}</div>
      <button type="button" className="text-xs text-white/50 mb-2" onClick={() => setPath(path.split('/').slice(0, -1).join('/') || '/')}>
        ‹ parent
      </button>
      <div className="max-h-64 overflow-auto">
        {nodes.map((n) => (
          <button
            key={n.path}
            type="button"
            className="block w-full text-left term text-[11px] py-0.5 hover:text-teal-300"
            onClick={() => setPath(n.path)}
          >
            {n.type === 'dir' ? n.name + '/' : `${n.name}  ${formatBytes(n.size)}`}
          </button>
        ))}
      </div>
      {file?.type === 'file' && (
        <pre className="mt-3 term text-[11px] bg-black/40 p-3 rounded-xl max-h-56 overflow-auto whitespace-pre-wrap">
          {android.fs.readText(path)?.slice(0, 8000) || '(binary)'}
        </pre>
      )}
    </div>
  )
}


