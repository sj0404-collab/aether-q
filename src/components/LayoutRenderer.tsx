import type { CSSProperties } from 'react'
import type { InflatedView } from '../lib/layout'
import { WebViewHost } from './WebViewHost'
import { hasWebContent } from '../lib/webhost'
import { android } from '../lib/runtime'
import { audio } from '../lib/audio'
import { tts } from '../lib/tts'
import { logcat } from '../lib/logcat'

function parseColor(c: string) {
  if (!c) return undefined
  if (c.startsWith('#')) {
    if (c.length === 9) return `#${c.slice(3)}${c.slice(1, 3)}`
    return c
  }
  return undefined
}

function dim(v: string, axis: 'w' | 'h') {
  if (v === 'match_parent' || v === '-1' || v === 'fill_parent') return axis === 'w' ? 'w-full' : 'w-full min-h-[24px]'
  if (v === 'wrap_content' || v === '-2') return ''
  return ''
}

export function LayoutRenderer({
  view,
  pkg,
}: {
  view: InflatedView
  pkg: string
}) {
  const click = () => {
    audio.tap()
    if (view.onClick) {
      logcat.i('View', `performClick ${view.className} -> ${view.onClick}()`)
      android.art.bridge(pkg, view.onClick, [view.id])
    }
    if (view.type === 'Button' || view.type === 'FAB') {
      android.notify(pkg, view.text || 'Clicked', `${view.className} ${view.id}`)
    }
  }

  const style: CSSProperties = {
    background: parseColor(view.background),
    color: parseColor(view.textColor),
    fontSize: view.textSize ? parseInt(view.textSize, 10) || undefined : undefined,
    textAlign: view.gravity.includes('center') ? 'center' : view.gravity.includes('end') ? 'right' : undefined,
  }

  const kids = view.children.map((c, i) => <LayoutRenderer key={c.id + i} view={c} pkg={pkg} />)
  const width = dim(view.layoutWidth, 'w')
  const common = `${width} ${view.clickable ? 'cursor-pointer active:opacity-80' : ''}`

  switch (view.type) {
    case 'Button':
      return (
        <button type="button" onClick={click} style={style} className={`${common} mx-4 my-2 rounded-full bg-teal-400 text-black font-medium py-2.5 px-4`}>
          {view.text || 'Button'}
        </button>
      )
    case 'FAB':
      return (
        <button
          type="button"
          onClick={click}
          className="absolute bottom-20 right-5 w-14 h-14 rounded-full bg-teal-400 text-black text-2xl shadow-lg z-10"
        >
          {view.text || '+'}
        </button>
      )
    case 'TextView':
      return (
        <div style={style} className={`${common} px-4 py-1 text-[15px]`} onClick={view.clickable ? click : undefined}>
          {view.text}
          {kids}
        </div>
      )
    case 'EditText':
      return (
        <input
          className={`${common} mx-4 my-2 rounded-xl bg-white/10 px-3 py-2 outline-none`}
          placeholder={view.hint || view.text}
          defaultValue={view.text && !view.hint ? view.text : ''}
          onFocus={() => logcat.d('Ime', `showSoftInput ${view.id}`)}
        />
      )
    case 'ImageView':
    case 'ImageButton':
      return (
        <button type="button" onClick={click} className={`${common} flex items-center justify-center py-6 text-white/40 text-xs`}>
          {view.src || 'image'}
        </button>
      )
    case 'CheckBox':
    case 'Switch':
      return (
        <label className={`${common} flex items-center gap-2 px-4 py-2`}>
          <input type="checkbox" defaultChecked={view.attrs['android:checked'] === 'true'} />
          <span>{view.text}</span>
        </label>
      )
    case 'ProgressBar':
      return (
        <div className="mx-4 my-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-2/3 bg-teal-400" />
        </div>
      )
    case 'SeekBar':
      return <input type="range" className="mx-4 my-3 w-[calc(100%-2rem)]" defaultValue={40} />
    case 'WebView': {
      // Раньше здесь был поиск Google в iframe: без сети — пустой белый блок,
      // и никакой связи с приложением. Теперь, если в APK есть HTML, показываем
      // именно его; если нет — честно говорим, что грузить нечего.
      const gp = android.packages.get(pkg)?.pkg
      if (gp && hasWebContent(gp)) {
        return (
          <div className="w-full h-64 flex flex-col">
            <WebViewHost pkg={gp} showStatus={false} />
          </div>
        )
      }
      return (
        <div className="m-3 p-3 rounded border border-white/10 bg-white/5 term text-[10px] text-white/50">
          WebView: в этом APK нет HTML для экрана (assets/*.html)
        </div>
      )
    }
    case 'Toolbar':
    case 'AppBarLayout':
      return (
        <div className="px-4 py-3 bg-black/40 flex items-center gap-3" style={style}>
          <span className="text-lg font-medium">{view.text || android.packages.get(pkg)?.pkg.label}</span>
          {kids}
        </div>
      )
    case 'BottomNav':
      return (
        <div className="mt-auto flex justify-around py-2 bg-black/50 text-[11px] text-white/70">
          {(kids.length ? kids : ['Home', 'Search', 'You']).map((c, i) => (
            <div key={i} className="px-2">
              {typeof c === 'string' ? c : c}
            </div>
          ))}
        </div>
      )
    case 'RecyclerView':
    case 'ListView':
      return (
        <div className="flex-1 overflow-auto divide-y divide-white/5">
          {kids.length
            ? kids
            : Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 text-sm">
                  Item {i + 1}
                </div>
              ))}
        </div>
      )
    case 'CardView':
      return (
        <div className={`${common} mx-3 my-2 rounded-2xl bg-white/8 overflow-hidden`} style={style} onClick={view.clickable ? click : undefined}>
          {kids}
        </div>
      )
    case 'ScrollView':
    case 'HorizontalScrollView':
      return (
        <div className={`flex-1 overflow-auto ${view.orientation === 'horizontal' ? 'flex' : ''}`} style={style}>
          {kids}
        </div>
      )
    case 'LinearLayout':
      return (
        <div
          className={`${common} flex ${view.orientation === 'horizontal' ? 'flex-row items-center' : 'flex-col'} min-h-0`}
          style={style}
          onClick={view.clickable ? click : undefined}
        >
          {kids}
        </div>
      )
    case 'FrameLayout':
    case 'RelativeLayout':
    case 'ConstraintLayout':
    case 'CoordinatorLayout':
      return (
        <div className={`${common} relative flex flex-col min-h-0 flex-1`} style={style}>
          {kids}
        </div>
      )
    case 'Space':
      return <div className="h-3" />
    default:
      return (
        <div className={`${common} flex flex-col`} style={style} onClick={view.clickable ? click : undefined}>
          {view.text ? <div className="px-3 py-1 text-sm">{view.text}</div> : null}
          {kids}
        </div>
      )
  }
}

export function FallbackCompose({ pkg }: { pkg: string }) {
  const g = android.packages.get(pkg)
  if (!g) return null
  const strings = (g.pkg.mainDex?.strings || []).filter((s) => s.length > 2 && s.length < 42 && /[A-Za-z]/.test(s) && !s.includes('/') && !s.includes('.'))
  const unique = [...new Set(strings)].slice(0, 18)
  return (
    <div className="flex-1 bg-[#121212] text-white flex flex-col">
      <div className="px-4 py-3 flex items-center gap-3 bg-[#1e1e1e]">
        {g.pkg.iconUrl ? <img src={g.pkg.iconUrl} className="w-7 h-7 rounded-md" alt="" /> : null}
        <div>
          <div className="font-medium">{g.pkg.label}</div>
          <div className="text-[10px] text-teal-300">Jetpack Compose · Runtime 1.x</div>
        </div>
      </div>
      <div className="p-4 space-y-2 overflow-auto">
        {unique.map((s) => (
          <button
            key={s}
            type="button"
            className="block w-full text-left rounded-xl bg-white/5 px-3 py-2 text-sm"
            onClick={() => {
              audio.tap()
              tts.speak(s)
              android.art.bridge(g.pkg.packageName, 'onClick', [s])
            }}
          >
            {s}
          </button>
        ))}
        {!unique.length && <div className="text-white/50 text-sm">Composition started. No string resources decoded.</div>}
      </div>
    </div>
  )
}

export function FallbackRN({ pkg }: { pkg: string }) {
  const g = android.packages.get(pkg)
  if (!g) return null
  const bundle = g.jsBundle || ''
  const app = bundle.match(/registerComponent\(\s*["']([^"']+)["']/)?.[1] || g.pkg.label
  const mods = [...bundle.matchAll(/__d\(\s*function\s*\([^)]*\)\s*,\s*(\d+)/g)].slice(0, 12).map((m) => m[1])
  return (
    <div className="flex-1 bg-[#20232a] text-[#61dafb] flex flex-col">
      <div className="px-4 py-3 bg-[#282c34] text-white">
        <div className="text-[10px] uppercase tracking-widest text-[#61dafb]">React Native</div>
        <div className="text-lg font-medium">{app}</div>
        <div className="text-[11px] text-white/50">{g.pkg.packageName}</div>
      </div>
      <div className="p-4 text-xs font-mono text-white/80 overflow-auto flex-1">
        <div>AppRegistry → {app}</div>
        <div>Hermes bytecode / JS bundle {g.jsBundle ? `${g.jsBundle.length} chars loaded` : 'not found in assets/'}</div>
        <div>modules sampled: {mods.join(', ') || 'n/a'}</div>
        <pre className="mt-3 text-[10px] text-white/50 whitespace-pre-wrap">
          {(bundle || '').slice(0, 1200) || 'No index.android.bundle. UI inflated from native splash if present.'}
        </pre>
      </div>
    </div>
  )
}
