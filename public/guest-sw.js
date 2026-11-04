/* Service worker «Aether Q»: отдаёт содержимое установленного APK.
 *
 * Экран приложения — это его собственный HTML из assets/. Чтобы страница
 * работала со своими относительными путями и своим IndexedDB, её надо отдать
 * с того же origin, но по отдельному префиксу /guest/<id>/…, а не инлайном в
 * iframe (inline-document не имеет origin и не даёт IndexedDB).
 *
 * Файлы кладёт оболочка (src/lib/webhost.ts) в Cache API; здесь только выдача.
 */
const CACHE = 'aether-guest-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith('/guest/')) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(url.pathname)
      if (hit) return hit
      return new Response('Aether Q · в файлах этого APK нет «' + url.pathname + '»', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'aether:ping' && event.source) {
    event.source.postMessage({ type: 'aether:pong', at: Date.now() })
  }
})
