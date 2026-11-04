/**
 * WebViewHost — настоящий экран приложения внутри «телефона» эмулятора.
 *
 * Что делает:
 *   1. раскладывает файлы из APK (HTML-страницу и модели) в Cache API;
 *   2. поднимает iframe на /guest/<id>/<entry> — страница живёт со своим
 *.   origin, своим IndexedDB, своими относительными путями (как в WebView);
 *   3. сам подкладывает в поле выбора моделей страницы модели ИЗ APK —
 *      с теми именами, которые страница ждёт (detection.onnx / cyrillic.onnx /
 *      cyrillic.txt), и ждёт, пока её движок распознавания поднимется.
 *
 * Чего это НЕ делает (и почему): котлиновский/ART-слой не исполняется, нативного
 * onnxruntime из lib/arm64 в браузере нет. Распознавание идёт тем движком,
 * который приложение само возит в APK, — WASM-версией из той же страницы.
 */
import { useEffect, useRef, useState } from 'react'
import type { ApkPackage } from '../lib/apk'
import { guestUrl, installWebAssets, ensureGuestFiles, guestFile, webAppOf, type GuestWebApp } from '../lib/webhost'

type Stage = 'idle' | 'unpack' | 'boot' | 'models' | 'ready' | 'error'

const STAGE_TEXT: Record<Stage, string> = {
  idle: 'ожидание',
  unpack: 'распаковываю страницу из APK…',
  boot: 'страница приложения грузится…',
  models: 'подкладываю модели из APK в движок страницы…',
  ready: 'страница открыта · движок распознавания готов',
  error: 'ошибка',
}

export async function ensureGuestWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    await navigator.serviceWorker.register('/guest-sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return true
  } catch (e) {
    console.warn('service worker не поднялся', e)
    return false
  }
}

/**
 * Состояние движка распознавания внутри страницы.
 *
 * Важно: страница объявляет движок как `const OCR = {...}` — это лексическая
 * глобальная переменная, её НЕ видно как `window.OCR`. Поэтому спрашиваем через
 * eval в самом окне страницы (тот же origin), а не по свойству окна.
 */
export function guestEngineState(frame: HTMLIFrameElement): { found: boolean; ready: boolean; status: string } {
  const win = frame.contentWindow as Window | null
  if (!win) return { found: false, ready: false, status: 'нет окна страницы' }
  try {
    const raw = (win as Window & { eval: (s: string) => unknown }).eval(
      `(typeof OCR !== 'undefined')
        ? JSON.stringify({ found: true, ready: !!OCR.ready, status: (typeof OCR.statusText === 'function' ? OCR.statusText() : '') + (OCR.reason ? ' — ' + OCR.reason : '') })
        : JSON.stringify({ found: false, ready: false, status: '' })`,
    )
    return JSON.parse(String(raw)) as { found: boolean; ready: boolean; status: string }
  } catch (e) {
    return { found: false, ready: false, status: 'движок не отвечает: ' + (e as Error).message }
  }
}

/** Подкладывает файлы моделей в input#modelPick страницы и ждёт готовности OCR. */
async function provisionModels(
  frame: HTMLIFrameElement,
  app: GuestWebApp,
  pkg: ApkPackage,
  id: string,
  onStage: (s: Stage, note?: string) => void,
): Promise<void> {
  const win = frame.contentWindow
  const doc = frame.contentDocument
  if (!win || !doc) throw new Error('iframe страницы недоступен')

  const input = doc.querySelector<HTMLInputElement>('#modelPick')
  if (!input) throw new Error('в странице нет поля выбора моделей (#modelPick)')

  await ensureGuestFiles(pkg, app)
  const dt = new DataTransfer()
  for (const m of app.models) {
    const file = await guestFile(id, m.path)
    if (!file) continue
    // Имя — то, по которому страница различает модели. Байты — из APK.
    dt.items.add(new File([file], m.name, { type: file.type }))
  }
  if (!dt.files.length) throw new Error('в APK не нашлось файлов моделей')

  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))

  const deadline = Date.now() + 120_000
  let last = ''
  while (Date.now() < deadline) {
    const st = guestEngineState(frame)
    if (st.ready) return
    last = st.status || (st.found ? '' : 'движок страницы не найден')
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(last || 'движок не поднялся за 120 с')
}

export function WebViewHost({
  pkg,
  className = '',
  showStatus = true,
}: {
  pkg: ApkPackage
  className?: string
  showStatus?: boolean
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [note, setNote] = useState('')
  const [attempt, setAttempt] = useState(0)
  const app = webAppOf(pkg.id)

  const set = (s: Stage, extra = '') => {
    setStage(s)
    setNote(extra)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      set('unpack')
      const ok = await ensureGuestWorker()
      if (!ok) throw new Error('браузер не дал service worker — страницу из APK отдать нечем')
      const info = await installWebAssets(pkg)
      if (!alive) return
      if (!info) throw new Error('в APK нет HTML-страницы')
      set('boot')
      setSrc(guestUrl(pkg.id, info.entry))
    })().catch((e: Error) => alive && set('error', e.message || String(e)))
    return () => {
      alive = false
    }
  }, [pkg, attempt])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !src) return
    const info = webAppOf(pkg.id)
    if (!info) return
    const onLoad = () => {
      provisionModels(frame, info, pkg, pkg.id, set)
        .then(() => set('ready'))
        .catch((e: Error) => set('error', 'модели: ' + (e.message || e)))
    }
    frame.addEventListener('load', onLoad)
    return () => frame.removeEventListener('load', onLoad)
  }, [src, pkg.id])

  return (
    <div className={`relative flex-1 flex flex-col min-h-0 bg-black ${className}`}>
      {src ? (
        <iframe
          ref={frameRef}
          title={`${pkg.label} · WebView`}
          src={src}
          className="flex-1 w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        />
      ) : (
        <div className="flex-1 grid place-items-center p-4 text-center term text-[11px] text-teal-200/70">
          {STAGE_TEXT[stage]}
        </div>
      )}
      {/* Полоска состояния нужна только пока страница не открылась: когда всё
          готово, она лишь мешает и уезжает под навигацию «телефона». */}
      {showStatus && stage !== 'ready' && (
        <div className="shrink-0 px-2 py-1 flex items-center gap-2 border-t border-white/10 bg-black/60 text-[9px] leading-tight">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: stage === 'error' ? '#f87171' : '#fbbf24',
            }}
          />
          <span className={`truncate ${stage === 'error' ? 'text-red-300' : 'text-white/60'}`}>
            WebView · {STAGE_TEXT[stage]}
            {note ? ` · ${note}` : ''}
          </span>
          {stage === 'error' && (
            <button
              type="button"
              className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-white/10 text-white/70"
              onClick={() => {
                set('idle')
                setSrc(null)
                setAttempt((a) => a + 1)
              }}
            >
              ещё раз
            </button>
          )}
        </div>
      )}
    </div>
  )
}
