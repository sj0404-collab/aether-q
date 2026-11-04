import { useEffect, useState } from 'react'
import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { audio } from '../lib/audio'
import { BootScreen } from './BootScreen'
import { LockScreen } from './LockScreen'
import { Launcher } from './Launcher'
import { GuestAppScreen } from './GuestAppScreen'
import { NavBar } from './NavBar'
import { SystemScreen, QuickSettings } from './SystemApps'

export function DeviceFrame({ onDropApk }: { onDropApk: (f: File) => void }) {
  useRuntime()
  const [qs, setQs] = useState(false)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') android.back()
      if (e.key === 'Home') android.home()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] tracking-[0.4em] text-teal-400/70 uppercase mb-3">Aether Q · QEMU WASM · Android 10</div>
      <div
        className={`phone-bezel rounded-[42px] p-[12px] w-[360px] relative ${drag ? 'ring-2 ring-teal-400' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = [...e.dataTransfer.files].find((x) => /\.apk$/i.test(x.name) || x.type.includes('android') || x.type.includes('zip'))
          if (f) onDropApk(f)
        }}
      >
        <div className="absolute left-[-3px] top-28 w-[3px] h-10 rounded-l bg-[#2a2d36]" />
        <div className="absolute left-[-3px] top-44 w-[3px] h-16 rounded-l bg-[#2a2d36]" />
        <div className="absolute right-[-3px] top-36 w-[3px] h-14 rounded-r bg-[#2a2d36]" />
        <div
          className="oled rounded-[32px] overflow-hidden relative"
          style={{ width: 336, height: 640, filter: `brightness(${android.brightness})` }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-6 z-30"
            onClick={() => {
              setQs(true)
              audio.tap()
            }}
          />
          {!android.booted ? (
            <BootScreen />
          ) : android.locked ? (
            <LockScreen />
          ) : (
            <>
              {android.foreground.kind === 'launcher' && <Launcher />}
              {android.foreground.kind === 'app' && <GuestAppScreen pkgName={android.foreground.id} />}
              {android.foreground.kind === 'system' && <SystemScreen id={android.foreground.id} />}
              <div className="absolute bottom-0 left-0 right-0 z-20">
                <NavBar />
              </div>
              {qs && <QuickSettings onClose={() => setQs(false)} />}
            </>
          )}
          <div className="scan absolute inset-0 z-40 pointer-events-none" />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          className="px-3 py-1.5 rounded-full bg-white/5 text-xs"
          onClick={() => {
            android.locked = true
            android.emit()
          }}
        >
          Power
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-full bg-white/5 text-xs"
          onClick={() => {
            android.volume = Math.min(1, android.volume + 0.1)
            audio.setVolume(android.volume)
            android.emit()
          }}
        >
          Vol +
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-full bg-white/5 text-xs"
          onClick={() => {
            android.volume = Math.max(0, android.volume - 0.1)
            audio.setVolume(android.volume)
            android.emit()
          }}
        >
          Vol −
        </button>
      </div>
    </div>
  )
}
