import { android } from '../lib/runtime'
import { useRuntime } from '../lib/useRuntime'
import { StatusBar } from './StatusBar'
import { LayoutRenderer, FallbackCompose, FallbackRN } from './LayoutRenderer'
import { logcat } from '../lib/logcat'
import { audio } from '../lib/audio'
import { tts } from '../lib/tts'
import { net } from '../lib/network'
import { useState } from 'react'
import { WebViewHost } from './WebViewHost'
import { hasWebContent } from '../lib/webhost'

export function GuestAppScreen({ pkgName }: { pkgName: string }) {
  useRuntime()
  const g = android.packages.get(pkgName)
  const [tab, setTab] = useState<'ui' | 'info'>('ui')
  if (!g) {
    return (
      <div className="absolute inset-0 bg-black text-white grid place-items-center text-sm">
        Package not installed
      </div>
    )
  }
  const layout = g.layouts.find((l) => /activity_main|main|launcher/i.test(l.path)) || g.layouts[0]
  const permNet = g.pkg.permissions.some((p) => p.name.includes('INTERNET'))
  // Приложение с WebView-интерфейсом: показываем его настоящую страницу из APK,
  // а не заглушку с именами классов.
  const webApp = hasWebContent(g.pkg)

  return (
    <div className="absolute inset-0 bg-[#101114] text-white flex flex-col">
      <StatusBar />
      <div className="px-3 py-2 flex items-center gap-2 bg-black/40">
        {g.pkg.iconUrl ? <img src={g.pkg.iconUrl} className="w-6 h-6 rounded" alt="" /> : <div className="w-6 h-6 rounded bg-teal-600" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{g.pkg.label}</div>
          <div className="text-[10px] text-white/40 truncate">{g.pkg.launcher || g.pkg.packageName}</div>
        </div>
        <button type="button" className="text-[10px] px-2 py-1 rounded bg-white/10" onClick={() => setTab(tab === 'ui' ? 'info' : 'ui')}>
          {tab === 'ui' ? 'DEX' : 'UI'}
        </button>
      </div>
      {tab === 'ui' ? (
        <div className="flex-1 overflow-auto relative flex flex-col">
          {webApp ? (
            <WebViewHost pkg={g.pkg} />
          ) : layout?.root ? (
            <LayoutRenderer view={layout.root} pkg={g.pkg.packageName} />
          ) : g.reactNative ? (
            <FallbackRN pkg={g.pkg.packageName} />
          ) : g.compose ? (
            <FallbackCompose pkg={g.pkg.packageName} />
          ) : (
            <KotlinScaffold pkg={g.pkg.packageName} />
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 term text-[11px] text-teal-100/80 space-y-1">
          <div>package {g.pkg.packageName}</div>
          <div>
            v{g.pkg.versionName} ({g.pkg.versionCode}) sdk {g.pkg.minSdk}→{g.pkg.targetSdk}
          </div>
          <div>
            {g.pkg.dexFiles.length} dex · {g.pkg.nativeLibs.length} .so · {g.pkg.activities.length} activities
          </div>
          <div className="text-white/50 pt-2">classes</div>
          {(g.pkg.mainDex?.classes || []).slice(0, 40).map((c) => (
            <button
              key={c.name}
              type="button"
              className="block text-left w-full truncate hover:text-white"
              onClick={() => {
                android.art.invokeNamed(c.name, 'onCreate', [null])
                logcat.i('art', `forced ${c.name}.onCreate`)
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 text-[10px] border-t border-white/10">
        <button
          type="button"
          className="py-2"
          onClick={() => {
            audio.tap()
            tts.speak(`${g.pkg.label} version ${g.pkg.versionName}`)
          }}
        >
          TTS
        </button>
        <button
          type="button"
          className="py-2"
          onClick={async () => {
            if (!permNet) {
              logcat.w('NetworkSecurityConfig', 'INTERNET permission missing')
              return
            }
            try {
              const r = await net.fetch('https://www.google.com/generate_204')
              logcat.i('OkHttp', `GET generate_204 -> ${r.record.status} ${r.record.ms}ms`)
            } catch (e) {
              logcat.e('OkHttp', String(e))
            }
          }}
        >
          NET
        </button>
        <button
          type="button"
          className="py-2"
          onClick={() => {
            const lib = android.vm.images[0]
            if (lib) android.vm.runJniOnLoad(lib)
            else logcat.w('linker64', 'no arm64 image mapped')
          }}
        >
          JNI
        </button>
        <button
          type="button"
          className="py-2"
          onClick={() => {
            android.art.launchActivity(g.pkg.launcher || g.pkg.packageName)
            audio.notify()
          }}
        >
          RESUME
        </button>
      </div>
    </div>
  )
}

function KotlinScaffold({ pkg }: { pkg: string }) {
  const g = android.packages.get(pkg)!
  const acts = g.pkg.activities
  return (
    <div className="flex-1 flex flex-col bg-[#121212]">
      <div className="p-5">
        <div className="text-[11px] text-teal-400 uppercase tracking-widest">Activity</div>
        <div className="text-2xl font-semibold mt-1">{g.pkg.label}</div>
        <div className="text-xs text-white/50 mt-1">{g.pkg.applicationClass || g.pkg.packageName}</div>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {g.kotlin && <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 text-[10px]">Kotlin</span>}
          {g.compose && <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-200 text-[10px]">Compose</span>}
          {g.reactNative && <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 text-[10px]">React Native</span>}
          {g.pkg.frameworks.flutter && <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px]">Flutter</span>}
        </div>
      </div>
      <div className="px-3 space-y-1 overflow-auto">
        {acts.map((a) => (
          <button
            key={a.name}
            type="button"
            className="w-full text-left rounded-xl bg-white/5 px-3 py-2"
            onClick={() => {
              android.art.launchActivity(a.name.startsWith('.') ? g.pkg.packageName + a.name : a.name)
              audio.tap()
            }}
          >
            <div className="text-sm">{a.name.split('.').pop()}</div>
            <div className="text-[10px] text-white/40">{a.launcher ? 'LAUNCHER' : a.exported ? 'exported' : 'internal'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
