/* 纸间气球 · 导航/清单走网络优先，其余资源缓存优先 */
const CACHE = 'paper-balloon-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 始终最新：页面导航与 manifest */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  // 榜单接口直连网络，不写入缓存，避免首次请求命中过期数据
  if (new URL(req.url).pathname.indexOf('/api/') === 0) return;
  const nav = req.mode === 'navigate';
  const fresh = nav || new URL(req.url).pathname.endsWith('manifest.json');
  if (fresh) {
    e.respondWith(
      fetch(req).then(res => {
        // 仅缓存正常响应，避免把 404/500 页面写成离线兜底
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  /* 其余资源：缓存优先，回源补录 */
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
