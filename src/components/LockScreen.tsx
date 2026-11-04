import { useState } from 'react'
import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { audio } from '../lib/audio'
import { StatusBar } from './StatusBar'
import { Fingerprint, Flashlight, Camera } from 'lucide-react'

export function LockScreen() {
  useRuntime()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const d = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const press = (k: string) => {
    audio.key()
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    const next = (pin + k).slice(0, 6)
    setPin(next)
    if (next.length >= 4) {
      if (next === android.pin || next === '0000') {
        android.locked = false
        audio.unlockChime()
        android.emit()
      } else {
        setErr(true)
        audio.error()
        setTimeout(() => {
          setErr(false)
          setPin('')
        }, 420)
      }
    }
  }

  return (
    <div className="absolute inset-0 text-white overflow-hidden">
      <img src="/wallpapers/aether-q.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/80" />
      <div className="relative z-10 flex flex-col h-full">
        <StatusBar />
        <div className="pt-10 text-center">
          <div className="text-6xl font-light tracking-tight">{time}</div>
          <div className="mt-1 text-white/80 text-sm">{date}</div>
        </div>
        <div className="mt-6 px-6 space-y-2 max-h-24 overflow-auto">
          {android.notifications.slice(0, 3).map((n) => (
            <div key={n.id} className="glass rounded-2xl px-3 py-2 text-left">
              <div className="text-[11px] text-white/50">{n.pkg}</div>
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-xs text-white/70">{n.body}</div>
            </div>
          ))}
        </div>
        <div className="mt-auto pb-8">
          <div className={`text-center mb-3 tracking-[0.5em] text-lg ${err ? 'text-red-400' : 'text-white/80'}`}>
            {pin.replace(/./g, '●') || '····'}
          </div>
          <div className="grid grid-cols-3 gap-3 px-12">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === 'OK' ? press(pin ? '0' : '0000') : press(k === 'OK' ? '' : k))}
                className="h-14 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-xl"
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex justify-between px-10 mt-6 text-white/80">
            <button type="button" className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
              <Flashlight size={18} />
            </button>
            <button
              type="button"
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
              onClick={() => {
                android.locked = false
                audio.unlockChime()
                android.foreground = { kind: 'system', id: 'camera' }
                android.emit()
              }}
            >
              <Camera size={18} />
            </button>
          </div>
          <div className="flex justify-center mt-3 opacity-70">
            <Fingerprint size={22} />
          </div>
          <div className="text-center text-[10px] text-white/40 mt-1">PIN 0000 · tap OK with empty pin</div>
        </div>
      </div>
    </div>
  )
}
