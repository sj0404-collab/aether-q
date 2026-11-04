import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { Signal, Wifi, BatteryCharging, Battery } from 'lucide-react'

export function StatusBar({ light = false }: { light?: boolean }) {
  useRuntime()
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const c = light ? 'text-zinc-900' : 'text-white'
  return (
    <div className={`flex items-center justify-between px-5 pt-2.5 pb-1 text-[11px] font-medium ${c} select-none`}>
      <div className="flex items-center gap-1.5">
        <span className="tracking-wide">{hh}:{mm}</span>
        {android.notifications.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        )}
      </div>
      <div className="flex items-center gap-1.5 opacity-90">
        <Signal size={13} strokeWidth={2.2} />
        {android.wifi && !android.airplane ? <Wifi size={13} strokeWidth={2.2} /> : <span className="text-[10px] opacity-50">✕</span>}
        <span className="flex items-center gap-0.5">
          {android.charging ? <BatteryCharging size={14} strokeWidth={2.2} /> : <Battery size={14} strokeWidth={2.2} />}
          <span className="text-[10px] tabular-nums">{android.battery}</span>
        </span>
      </div>
    </div>
  )
}
