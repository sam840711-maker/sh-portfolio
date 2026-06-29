/* SH Portfolio — 서비스 워커
   - 문서(index.html): 네트워크 우선 + 2초 타임아웃 → 캐시 폴백 (느린 망에서도 즉시 오픈, 빠른 망이면 최신본)
   - 외부 CDN/폰트(버전 고정 URL): 캐시 우선 → 최초 1회만 네트워크 (콜드 스타트 가속)
   - sw.js: 항상 네트워크 (SW 갱신 보장)
   - 시세 프록시 등 그 외 교차출처: 미개입 */
const CACHE = 'sh-portfolio-v128';
const CDN_CACHE = 'sh-cdn-v1';   // CDN 자산(Chart.js 등) — 앱 버전 올려도 유지(차트 깨짐 방지)
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putCache(req, resp, cacheName) {
  if (resp && (resp.status === 200 || resp.type === 'opaque')) {
    const copy = resp.clone();
    caches.open(cacheName || CACHE).then(c => c.put(req, copy)).catch(() => {});
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 교차출처
  if (url.origin !== location.origin) {
    if (CDN_HOSTS.includes(url.hostname)) {
      e.respondWith(
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => { putCache(e.request, resp, CDN_CACHE); return resp; });
        }).catch(() => fetch(e.request))
      );
    }
    return;
  }

  // sw.js: 항상 네트워크
  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }

  // HTML 문서: 네트워크 우선 + 2초 타임아웃 → 캐시
  const isHTMLish = e.request.mode === 'navigate'
                 || url.pathname === '/' || url.pathname.endsWith('/')
                 || url.pathname.endsWith('.html');

  if (isHTMLish) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      const netP = fetch(e.request, { cache: 'no-store' })
        .then(resp => { putCache(e.request, resp); return resp; })
        .catch(() => null);
      if (!cached) {
        const r = await netP;
        return r || caches.match('./index.html');
      }
      const winner = await Promise.race([netP, new Promise(res => setTimeout(() => res('TIMEOUT'), 2000))]);
      return (winner && winner !== 'TIMEOUT') ? winner : cached;
    })());
    return;
  }

  // 그 외 동일 출처 정적: 캐시 우선 + 백그라운드 갱신
  e.respondWith(
    caches.match(e.request).then(cached => {
      const netP = fetch(e.request)
        .then(resp => { putCache(e.request, resp); return resp; })
        .catch(() => cached);
      return cached || netP;
    })
  );
});
