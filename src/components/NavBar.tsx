import { android } from '../lib/runtime'
import { Square, Triangle, Circle } from 'lucide-react'

export function NavBar() {
  return (
    <div className="h-11 flex items-center justify-around px-10 bg-black/80 text-white/80">
      <button
        type="button"
        className="p-2 active:scale-90 transition"
        onClick={() => android.back()}
        aria-label="Back"
      >
        <Triangle size={16} className="-rotate-90 fill-white/80" />
      </button>
      <button
        type="button"
        className="p-2 active:scale-90 transition"
        onClick={() => android.home()}
        aria-label="Home"
      >
        <Circle size={16} />
      </button>
      <button
        type="button"
        className="p-2 active:scale-90 transition"
        onClick={() => {
          android.foreground = { kind: 'system', id: 'recents' }
          android.emit()
        }}
        aria-label="Recents"
      >
        <Square size={15} />
      </button>
    </div>
  )
}
