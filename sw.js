/* SH Portfolio — 서비스 워커
   index.html은 항상 네트워크 최신본을 받도록 no-store로 가져오고,
   오프라인일 때만 캐시 폴백. 그 외 정적 파일은 네트워크 우선 + 캐시. */
const CACHE = 'sh-portfolio-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // HTML 문서/네비게이션/sw.js → 브라우저 HTTP 캐시 무시하고 항상 네트워크 최신본
  const isHTMLish = e.request.mode === 'navigate'
                 || url.pathname === '/' || url.pathname.endsWith('/')
                 || url.pathname.endsWith('.html')
                 || url.pathname.endsWith('sw.js');

  if (isHTMLish) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 그 외 (매니페스트·아이콘 등) → 기존 네트워크 우선 + 캐시
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
  );
});
