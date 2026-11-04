/**
 * ГОСТЕВОЙ WEBVIEW — настоящая страница приложения из его же APK.
 *
 * Зачем это здесь.
 *
 * Aether Q разбирает APK целиком: манифест, resources.arsc, DEX, ELF. Но
 * приложение, чей интерфейс — это `WebView` (как KOMA, которая грузит
 * `assets/koma-web.html`), показывалось заглушкой «KotlinScaffold»: экран
 * пустой, и проверить в такой среде нечего.
 *
 * Котлиновский слой мы выполнить не можем (это JS-модель, а не настоящий ART),
 * а вот СОДЕРЖИМОЕ экрана — настоящий HTML из APK — можем отдать как есть:
 * те же байты, тот же движок распознавания (WASM), те же модели из `assets/`.
 *
 * Как: файлы гостя складываются в Cache API и отдаются Service Worker'ом по
 * адресу `/guest/<id>/<путь внутри APK>`. Отдельный origin не нужен, поэтому:
 *   • IndexedDB страницы работает (модели, книги, настройки);
 *   • модели читаются по относительным путям;
 *   • оболочка (лаунчер, статус-бар, установка) — среда, экран — приложение.
 */
import type { ApkPackage } from './apk'

export const GUEST_CACHE = 'aether-guest-v1'
export const GUEST_PREFIX = '/guest/'

export function guestUrl(id: string, path: string) {
  return GUEST_PREFIX + id + '/' + path.replace(/^\/+/, '')
}

export type GuestWebApp = {
  entry: string
  /** файлы моделей в том виде, в каком их ждёт страница (имя → путь в APK) */
  models: { name: string; path: string }[]
  bytes: number
}

/** Установленные web-приложения этой сессии: id → сведения. */
const registry = new Map<string, GuestWebApp>()
const pending = new Map<string, Promise<GuestWebApp | null>>()

export function webAppOf(id: string) {
  return registry.get(id) || null
}

/** Главный HTML приложения: самый крупный .html в assets/. */
export function findEntryHtml(pkg: ApkPackage): string | null {
  const html = (pkg.assets || []).filter((a) => /\.html?$/i.test(a))
  if (!html.length) return null
  const size = (p: string) => pkg.files.find((f) => f.name === p)?.size || 0
  return html.sort((a, b) => size(b) - size(a))[0]
}

/**
 * Похоже ли приложение на «WebView-приложение»: есть HTML в assets и в DEX
 * упоминается android.webkit.WebView. Одно без другого — ещё не повод.
 */
export function hasWebContent(pkg: ApkPackage): boolean {
  if (!pkg || !findEntryHtml(pkg)) return false
  const dex = [...(pkg.mainDex?.types || []), ...(pkg.mainDex?.strings || [])].join('\n').toLowerCase()
  const others = pkg.dexFiles.map((d) => (d.info ? [...d.info.types, ...d.info.strings].join('\n') : '')).join('\n').toLowerCase()
  const blob = dex + '\n' + others
  return blob.includes('android/webkit/webview') || blob.includes('webviewassetloader') || blob.includes('webchromeclient')
}

/** Имена, которые ждёт страница читалки, и их имена внутри APK. */
const MODEL_ALIASES: { want: string; match: RegExp }[] = [
  { want: 'detection.onnx', match: /(^|\/)(det|detection)\.onnx$/i },
  { want: 'cyrillic.onnx', match: /(^|\/)(rec|cyrillic)\.onnx$/i },
  { want: 'cyrillic.txt', match: /(^|\/)(charset|cyrillic)\.txt$/i },
  { want: 'eslav.onnx', match: /(^|\/)eslav\.onnx$/i },
  { want: 'eslav-charset.txt', match: /(^|\/)eslav[-_]charset\.txt$/i },
]

/** Разложить файлы приложения в кэш и вернуть сведения о web-части. */
export function installWebAssets(pkg: ApkPackage): Promise<GuestWebApp | null> {
  const already = pending.get(pkg.id)
  if (already) return already
  const job = (async (): Promise<GuestWebApp | null> => {
    const entry = findEntryHtml(pkg)
    if (!entry) return null
    const cache = await caches.open(GUEST_CACHE)
    const put = async (path: string, type: string) => {
      const f = pkg.zip.file(path)
      if (!f) return 0
      const buf = await f.async('arraybuffer')
      await cache.put(guestUrl(pkg.id, path), new Response(buf, {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      }))
      return buf.byteLength
    }
    let bytes = await put(entry, 'text/html; charset=utf-8')
    // Модели НЕ распаковываем здесь: 15 МБ onnx рядом с разбором 40-мегабайтного
    // APK — это лишние сотни мегабайт на пике. Их достанем по требованию,
    // когда страница попросит (ensureGuestFiles).
    const models: { name: string; path: string }[] = []
    for (const a of pkg.assets || []) {
      const alias = MODEL_ALIASES.find((m) => m.match.test(a))
      if (!alias) continue
      // Второй распознаватель и его азбука — отдельными именами, чтобы страница
      // не перепутала их с основными (она различает модели по имени файла).
      if (models.some((m) => m.name === alias.want)) continue
      models.push({ name: alias.want, path: a })
    }
    // Правила/плагины читалки, если они лежат рядом.
    for (const a of pkg.assets || []) {
      if (/^assets\/plugins\/.+\.json$/i.test(a)) bytes += await put(a, 'application/json')
    }
    const info: GuestWebApp = { entry, models, bytes }
    registry.set(pkg.id, info)
    pending.delete(pkg.id)
    return info
  })().catch((e) => {
    pending.delete(pkg.id)
    console.warn('гостевые файлы не разложились', e)
    return null
  })
  pending.set(pkg.id, job)
  return job
}

/** Кладёт в кэш файлы моделей (по одному, освобождая память сразу). */
export async function ensureGuestFiles(pkg: ApkPackage, app: GuestWebApp): Promise<void> {
  const cache = await caches.open(GUEST_CACHE)
  for (const m of app.models) {
    const url = guestUrl(pkg.id, m.path)
    if (await cache.match(url)) continue
    const f = pkg.zip.file(m.path)
    if (!f) continue
    const buf = await f.async('arraybuffer')
    await cache.put(url, new Response(buf, {
      headers: {
        'content-type': /\.onnx$/i.test(m.path) ? 'application/octet-stream' : 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    }))
  }
}

/** Байты файла модели — для автоподстановки в страницу. */
export async function guestFile(id: string, path: string): Promise<File | null> {
  const res = await fetch(guestUrl(id, path))
  if (!res.ok) return null
  const blob = await res.blob()
  const name = path.split('/').pop() || 'file'
  return new File([blob], name)
}
