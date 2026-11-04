import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { StatusBar } from './StatusBar'
import {
  Phone,
  MessageSquare,
  Globe,
  Camera,
  Image as ImageIcon,
  Clock,
  Settings,
  Folder,
  ShoppingBag,
  Users,
  Calculator,
  Calendar,
  Youtube,
  Map,
  Mic,
  Terminal,
  Search,
} from 'lucide-react'
import type { ReactNode } from 'react'

const ICONS: Record<string, ReactNode> = {
  phone: <Phone size={22} />,
  message: <MessageSquare size={22} />,
  globe: <Globe size={22} />,
  camera: <Camera size={22} />,
  image: <ImageIcon size={22} />,
  clock: <Clock size={22} />,
  settings: <Settings size={22} />,
  folder: <Folder size={22} />,
  store: <ShoppingBag size={22} />,
  users: <Users size={22} />,
  calc: <Calculator size={22} />,
  cal: <Calendar size={22} />,
  yt: <Youtube size={22} />,
  map: <Map size={22} />,
  mic: <Mic size={22} />,
  term: <Terminal size={22} />,
}

export function Launcher() {
  useRuntime()
  const sys = android.systemApps()
  const guest = [...android.packages.values()]
  const dock = sys.filter((s) => ['dialer', 'messages', 'chrome', 'camera'].includes(s.id))
  const rest = sys.filter((s) => !['dialer', 'messages', 'chrome', 'camera'].includes(s.id))

  return (
    <div className="absolute inset-0 text-white overflow-hidden">
      <img src="/wallpapers/aether-q.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative z-10 flex flex-col h-full">
        <StatusBar />
        <div className="px-6 pt-6">
          <div className="glass rounded-full flex items-center gap-2 px-4 py-2.5 text-white/80">
            <Search size={16} />
            <span className="text-sm">Search apps, web, settings</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-5 pt-6 pb-2 grid grid-cols-4 gap-y-5 gap-x-2 content-start">
          {guest.map((g) => (
            <button
              key={g.pkg.packageName}
              type="button"
              className="flex flex-col items-center gap-1.5"
              onClick={() => android.launch(g.pkg.packageName)}
            >
              {g.pkg.iconUrl ? (
                <img src={g.pkg.iconUrl} alt="" className="w-12 h-12 rounded-2xl shadow-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-teal-500/80 grid place-items-center text-lg font-semibold">
                  {g.pkg.label.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-center leading-tight line-clamp-2 w-16 drop-shadow">{g.pkg.label}</span>
            </button>
          ))}
          {rest.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex flex-col items-center gap-1.5"
              onClick={() => {
                android.foreground = { kind: 'system', id: s.id }
                android.emit()
              }}
            >
              <div className="w-12 h-12 rounded-2xl grid place-items-center shadow-lg" style={{ background: s.color }}>
                {ICONS[s.icon]}
              </div>
              <span className="text-[11px] text-center leading-tight w-16 drop-shadow">{s.label}</span>
            </button>
          ))}
        </div>
        <div className="px-5 pb-3">
          <div className="glass rounded-[28px] px-3 py-3 flex justify-around">
            {dock.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-12 h-12 rounded-2xl grid place-items-center"
                style={{ background: s.color }}
                onClick={() => {
                  android.foreground = { kind: 'system', id: s.id }
                  android.emit()
                }}
              >
                {ICONS[s.icon]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
