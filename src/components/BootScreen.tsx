import { useEffect, useState } from 'react'
import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'

export function BootScreen() {
  useRuntime()
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setPct(Math.min(100, Math.round((android.bootStage / 22) * 100)))
    }, 80)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="absolute inset-0 bg-black text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <img src="/boot/android-mark.png" alt="" className="w-24 h-24 object-contain opacity-90" />
        <div className="text-center">
          <div className="text-[10px] tracking-[0.35em] text-teal-400/80 uppercase">Aether Q</div>
          <div className="text-lg font-medium mt-1">Android 10</div>
          <div className="text-[11px] text-white/40 mt-1 font-mono">arm64-v8a · API 29 · QP1A</div>
        </div>
        <div className="w-40 h-[3px] bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="h-36 px-4 pb-4 overflow-hidden term text-[10px] text-teal-300/70">
        {android.bootLog.slice(-8).map((l, i) => (
          <div key={i} className="truncate">
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
