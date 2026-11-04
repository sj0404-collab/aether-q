import { useEffect, useRef, useState } from 'react'
import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { StatusBar } from './StatusBar'
import { audio } from '../lib/audio'
import { tts } from '../lib/tts'
import { net } from '../lib/network'
import { runCommand } from '../lib/shell'
import { logcat } from '../lib/logcat'
import { formatBytes } from '../lib/binary'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Wifi,
  Bluetooth,
  Plane,
  Sun,
  Volume2,
  MapPin,
  BellOff,
  Trash2,
} from 'lucide-react'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 bg-[#0e0f12] text-white flex flex-col">
      <StatusBar />
      <div className="px-4 py-3 text-base font-medium bg-black/30">{title}</div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}

export function SystemScreen({ id }: { id: string }) {
  useRuntime()
  switch (id) {
    case 'dialer':
      return <Dialer />
    case 'messages':
      return <Messages />
    case 'chrome':
      return <Chrome />
    case 'camera':
      return <Cam />
    case 'photos':
      return <Photos />
    case 'clock':
      return <ClockApp />
    case 'settings':
      return <SettingsApp />
    case 'files':
      return <FilesApp />
    case 'play':
      return <PlayStore />
    case 'contacts':
      return <Contacts />
    case 'calculator':
      return <Calc />
    case 'calendar':
      return <Cal />
    case 'youtube':
      return <Tube />
    case 'maps':
      return <Maps />
    case 'tts':
      return <Speech />
    case 'terminal':
      return <TerminalApp />
    case 'recents':
      return <Recents />
    default:
      return (
        <Shell title={id}>
          <div className="p-4 text-sm text-white/60">System component {id}</div>
        </Shell>
      )
  }
}

function Dialer() {
  const [n, setN] = useState('')
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
  return (
    <Shell title="Phone">
      <div className="px-6 pt-6 text-3xl tracking-[0.2em] text-center min-h-[3rem] font-light">{n || ' '}</div>
      <div className="grid grid-cols-3 gap-3 px-10 mt-4">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className="h-14 rounded-full bg-white/8 text-xl"
            onClick={() => {
              audio.key()
              setN((x) => (x + k).slice(0, 16))
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-6 mt-6 pb-6">
        <button
          type="button"
          className="w-16 h-16 rounded-full bg-green-500 text-black font-medium"
          onClick={() => {
            audio.ringtone(1)
            tts.speak(`Calling ${n || 'voicemail'}`)
            android.notify('com.android.dialer', 'Outgoing call', n || 'Voice Mail')
          }}
        >
          Call
        </button>
        <button type="button" className="w-16 h-16 rounded-full bg-white/10" onClick={() => setN((x) => x.slice(0, -1))}>
          ⌫
        </button>
      </div>
    </Shell>
  )
}

function Messages() {
  const [text, setText] = useState('')
  const [thread, setThread] = useState<{ me: boolean; t: string }[]>([
    { me: false, t: 'Welcome to Aether Q. SMS is local to this emulator.' },
  ])
  return (
    <Shell title="Messages">
      <div className="p-3 space-y-2 min-h-[70%]">
        {thread.map((m, i) => (
          <div key={i} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.me ? 'ml-auto bg-teal-500 text-black' : 'bg-white/10'}`}>
            {m.t}
          </div>
        ))}
      </div>
      <form
        className="p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          setThread((t) => [...t, { me: true, t: text }])
          audio.notify()
          tts.speak(text)
          setText('')
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-white/10 rounded-full px-4 py-2 outline-none"
          placeholder="Text message"
        />
        <button className="px-3 rounded-full bg-teal-400 text-black">Send</button>
      </form>
    </Shell>
  )
}

function Chrome() {
  const [url, setUrl] = useState('https://www.google.com/webhp?igu=1')
  const [src, setSrc] = useState('https://www.google.com/webhp?igu=1')
  return (
    <div className="absolute inset-0 bg-white text-black flex flex-col">
      <StatusBar light />
      <form
        className="flex items-center gap-1 px-2 py-1.5 bg-zinc-100"
        onSubmit={(e) => {
          e.preventDefault()
          let u = url.trim()
          if (!/^https?:/i.test(u)) u = 'https://' + u
          setSrc(u)
          void net.fetch(u).catch(() => undefined)
        }}
      >
        <button type="button" onClick={() => history.back()}>
          <ArrowLeft size={16} />
        </button>
        <button type="button">
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setSrc(src)
          }}
        >
          <RotateCw size={14} />
        </button>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-white rounded-full px-3 py-1 text-xs outline-none border border-zinc-200"
        />
      </form>
      <iframe title="chrome" src={src} className="flex-1 w-full bg-white" />
    </div>
  )
}

function Cam() {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch((e) => setErr(e.message))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])
  return (
    <div className="absolute inset-0 bg-black text-white flex flex-col">
      <StatusBar />
      <div className="flex-1 relative">
        <video ref={video} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        {err && <div className="absolute inset-0 grid place-items-center text-xs text-white/60 p-6 text-center">{err}</div>}
      </div>
      <div className="h-24 grid place-items-center">
        <button
          type="button"
          className="w-16 h-16 rounded-full border-4 border-white"
          onClick={() => {
            audio.cameraShutter()
            android.notify('com.android.camera2', 'Camera', 'Image saved to DCIM/Camera')
          }}
        />
      </div>
    </div>
  )
}

function Photos() {
  const shots = ['/gallery/city.jpg', '/gallery/mountain.jpg', '/gallery/architecture.jpg', '/gallery/forest.jpg', '/wallpapers/aether-q.jpg']
  return (
    <Shell title="Photos">
      <div className="grid grid-cols-2 gap-1 p-1">
        {shots.map((s) => (
          <img key={s} src={s} alt="" className="w-full h-36 object-cover" />
        ))}
      </div>
    </Shell>
  )
}

function ClockApp() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const t = new Date().toLocaleTimeString()
  return (
    <Shell title="Clock">
      <div className="text-center pt-16">
        <div className="text-5xl font-light tabular-nums">{t}</div>
        <div className="mt-10 flex justify-center gap-3">
          <button type="button" className="px-4 py-2 rounded-full bg-white/10" onClick={() => audio.alarm()}>
            Alarm
          </button>
          <button type="button" className="px-4 py-2 rounded-full bg-white/10" onClick={() => audio.ringtone()}>
            Timer
          </button>
        </div>
      </div>
    </Shell>
  )
}

function SettingsApp() {
  useRuntime()
  const Row = ({
    label,
    on,
    toggle,
    icon,
  }: {
    label: string
    on: boolean
    toggle: () => void
    icon: React.ReactNode
  }) => (
    <button type="button" onClick={toggle} className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5">
      <span className="text-teal-300">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className={`w-10 h-6 rounded-full relative ${on ? 'bg-teal-400' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${on ? 'left-4.5' : 'left-0.5'}`} style={{ left: on ? 18 : 2 }} />
      </span>
    </button>
  )
  return (
    <Shell title="Settings">
      <div className="px-4 py-3 text-xs text-white/40">Aether Q · Android 10 · {android.serial}</div>
      <Row label="Wi‑Fi" on={android.wifi} toggle={() => { android.wifi = !android.wifi; android.emit() }} icon={<Wifi size={16} />} />
      <Row label="Bluetooth" on={android.bluetooth} toggle={() => { android.bluetooth = !android.bluetooth; android.emit() }} icon={<Bluetooth size={16} />} />
      <Row label="Airplane" on={android.airplane} toggle={() => { android.airplane = !android.airplane; if (android.airplane) android.wifi = false; android.emit() }} icon={<Plane size={16} />} />
      <Row label="Location" on={android.location} toggle={() => { android.location = !android.location; android.emit() }} icon={<MapPin size={16} />} />
      <Row label="Do not disturb" on={android.dnd} toggle={() => { android.dnd = !android.dnd; android.emit() }} icon={<BellOff size={16} />} />
      <div className="px-4 py-3 flex items-center gap-3">
        <Sun size={16} className="text-teal-300" />
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.01}
          value={android.brightness}
          onChange={(e) => {
            android.brightness = Number(e.target.value)
            android.emit()
          }}
          className="flex-1"
        />
      </div>
      <div className="px-4 py-3 flex items-center gap-3">
        <Volume2 size={16} className="text-teal-300" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={android.volume}
          onChange={(e) => {
            android.volume = Number(e.target.value)
            audio.setVolume(android.volume)
            android.emit()
          }}
          className="flex-1"
        />
      </div>
      <div className="p-4 text-xs text-white/50 term space-y-1">
        <div>fingerprint {android.fs.readText('/system/build.prop')?.split('\n').find((l) => l.startsWith('ro.build.fingerprint'))}</div>
        <div>packages {android.packages.size} guest</div>
      </div>
    </Shell>
  )
}

function FilesApp() {
  const [path, setPath] = useState('/data')
  const nodes = android.fs.list(path)
  return (
    <Shell title="Files">
      <div className="px-3 py-2 text-[11px] text-teal-300 term">{path}</div>
      <button type="button" className="px-4 py-2 text-sm text-white/60" onClick={() => setPath(path.split('/').slice(0, -1).join('/') || '/')}>
        ‹ parent
      </button>
      {nodes.map((n) => (
        <button
          key={n.path}
          type="button"
          className="w-full text-left px-4 py-2 flex justify-between text-sm border-b border-white/5"
          onClick={() => {
            if (n.type === 'dir') setPath(n.path)
            else logcat.i('DocumentsUI', `open ${n.path} ${formatBytes(n.size)}`)
          }}
        >
          <span className="truncate">{n.type === 'dir' ? n.name + '/' : n.name}</span>
          <span className="text-white/40 text-[11px]">{n.type === 'file' ? formatBytes(n.size) : ''}</span>
        </button>
      ))}
    </Shell>
  )
}

function PlayStore() {
  return (
    <Shell title="Play Store">
      <div className="p-4 text-sm text-white/70 space-y-3">
        <p>Sideload APKs with the host installer. Play Store catalog is not mirrored.</p>
        <p className="text-xs text-white/40">Drop a .apk on the device or use the Install APK control. Kotlin, Compose, React Native and native arm64-v8a libraries are parsed on install.</p>
      </div>
    </Shell>
  )
}

function Contacts() {
  const people = [
    ['Aether Lab', '100'],
    ['Emulator', '555-0100'],
    ['Logcat', '*#*#1472365#*#*'],
  ]
  return (
    <Shell title="Contacts">
      {people.map(([n, p]) => (
        <div key={n} className="px-4 py-3 border-b border-white/5">
          <div>{n}</div>
          <div className="text-xs text-white/50">{p}</div>
        </div>
      ))}
    </Shell>
  )
}

function Calc() {
  const [exp, setExp] = useState('0')
  const keys = ['C', '⌫', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '+/-', '0', '.', '=']
  const go = (k: string) => {
    audio.key()
    if (k === 'C') setExp('0')
    else if (k === '⌫') setExp((s) => s.slice(0, -1) || '0')
    else if (k === '=') {
      try {
        const v = Function(`"use strict"; return (${exp.replace(/%/g, '/100')})`)()
        setExp(String(v))
      } catch {
        setExp('Err')
      }
    } else if (k === '+/-') setExp((s) => (s.startsWith('-') ? s.slice(1) : '-' + s))
    else setExp((s) => (s === '0' || s === 'Err' ? k : s + k))
  }
  return (
    <Shell title="Calculator">
      <div className="px-5 py-8 text-right text-4xl font-light tabular-nums break-all">{exp}</div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => go(k)} className="h-14 rounded-2xl bg-white/8 text-lg">
            {k}
          </button>
        ))}
      </div>
    </Shell>
  )
}

function Cal() {
  const d = new Date()
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return (
    <Shell title="Calendar">
      <div className="p-4 grid grid-cols-7 gap-2 text-center text-sm">
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className={`py-2 rounded-full ${i + 1 === d.getDate() ? 'bg-teal-400 text-black' : ''}`}>
            {i + 1}
          </div>
        ))}
      </div>
    </Shell>
  )
}

function Tube() {
  return (
    <div className="absolute inset-0 bg-black flex flex-col">
      <StatusBar />
      <div className="px-3 py-2 text-white font-medium">YouTube</div>
      <iframe
        className="flex-1"
        title="yt"
        src="https://www.youtube.com/embed/aqz-KE-bpKQ?autoplay=0"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
      />
    </div>
  )
}

function Maps() {
  return (
    <div className="absolute inset-0 bg-zinc-200 flex flex-col">
      <StatusBar light />
      <iframe title="maps" className="flex-1" src="https://maps.google.com/maps?q=37.422&z=12&output=embed" />
    </div>
  )
}

function Speech() {
  const [text, setText] = useState('Android 10 on Aether Q. Text to speech is live.')
  const [lang, setLang] = useState('en-US')
  return (
    <Shell title="Speech services">
      <div className="p-4 space-y-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-28 bg-white/8 rounded-xl p-3 outline-none" />
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-white/8 rounded-lg px-2 py-2">
          {['en-US', 'en-GB', 'ru-RU', 'es-ES', 'de-DE', 'fr-FR', 'ja-JP', 'zh-CN'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-full bg-teal-400 text-black"
            onClick={() => {
              tts.lang = lang
              tts.speak(text, { lang })
            }}
          >
            Speak
          </button>
          <button type="button" className="px-4 py-2 rounded-full bg-white/10" onClick={() => tts.stop()}>
            Stop
          </button>
        </div>
        <div className="text-[11px] text-white/40 term">
          {tts.history.slice(0, 6).map((h, i) => (
            <div key={i}>{h.text}</div>
          ))}
        </div>
      </div>
    </Shell>
  )
}

function TerminalApp() {
  const [lines, setLines] = useState<{ k: string; t: string }[]>([
    { k: 'sys', t: 'AetherQ adb shell  userdebug 10 QP1A  arm64' },
    { k: 'sys', t: 'type help' },
  ])
  const [cmd, setCmd] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo(0, 9e9)
  }, [lines])
  return (
    <div className="absolute inset-0 bg-black text-green-400 flex flex-col">
      <StatusBar />
      <div ref={ref} className="flex-1 overflow-auto p-3 term text-[11px] space-y-1">
        {lines.map((l, i) => (
          <div key={i} className={l.k === 'in' ? 'text-teal-200' : l.k === 'err' ? 'text-red-400' : ''}>
            {l.k === 'in' ? `# ${l.t}` : l.t}
          </div>
        ))}
      </div>
      <form
        className="p-2 flex gap-2 border-t border-white/10"
        onSubmit={async (e) => {
          e.preventDefault()
          const c = cmd
          setCmd('')
          setLines((xs) => [...xs, { k: 'in', t: c }])
          const out = await runCommand(c)
          if (out === '\x1bc') setLines([])
          else if (out) setLines((xs) => [...xs, { k: 'out', t: out }])
        }}
      >
        <span className="term text-teal-400">#</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} className="flex-1 bg-transparent outline-none term text-green-300" autoFocus />
      </form>
    </div>
  )
}

function Recents() {
  const items = android.activities.slice().reverse()
  return (
    <Shell title="Recents">
      {items.length === 0 && <div className="p-6 text-white/40 text-sm">No recent guest tasks</div>}
      {items.map((a) => (
        <button
          key={a.task}
          type="button"
          className="w-full text-left px-4 py-3 border-b border-white/5"
          onClick={() => android.launch(a.pkg)}
        >
          <div>{a.activity.split('.').pop()}</div>
          <div className="text-[11px] text-white/40">
            {a.pkg} · {a.state}
          </div>
        </button>
      ))}
    </Shell>
  )
}

export function QuickSettings({ onClose }: { onClose: () => void }) {
  useRuntime()
  const tiles = [
    { id: 'wifi', label: 'Wi‑Fi', on: android.wifi, set: () => { android.wifi = !android.wifi } },
    { id: 'bt', label: 'Bluetooth', on: android.bluetooth, set: () => { android.bluetooth = !android.bluetooth } },
    { id: 'air', label: 'Airplane', on: android.airplane, set: () => { android.airplane = !android.airplane } },
    { id: 'loc', label: 'Location', on: android.location, set: () => { android.location = !android.location } },
    { id: 'dnd', label: 'DND', on: android.dnd, set: () => { android.dnd = !android.dnd } },
    { id: 'rot', label: 'Rotation', on: !android.rotationLocked, set: () => { android.rotationLocked = !android.rotationLocked } },
    { id: 'lock', label: android.locked ? 'Lock' : 'Unlock', on: !android.locked, set: () => { android.locked = !android.locked } },
    { id: 'mute', label: 'Sound', on: !audio.muted, set: () => audio.setMuted(!audio.muted) },
  ]
  return (
    <div className="absolute inset-0 z-40 bg-black/50" onClick={onClose}>
      <div className="glass m-3 mt-8 rounded-3xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-4 gap-2">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                t.set()
                android.emit()
              }}
              className={`rounded-2xl py-3 text-[11px] ${t.on ? 'bg-teal-400 text-black' : 'bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {android.notifications.map((n) => (
            <div key={n.id} className="bg-white/5 rounded-xl px-3 py-2 flex gap-2">
              <div className="flex-1">
                <div className="text-xs font-medium">{n.title}</div>
                <div className="text-[11px] text-white/50">{n.body}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  android.notifications = android.notifications.filter((x) => x.id !== n.id)
                  android.emit()
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


