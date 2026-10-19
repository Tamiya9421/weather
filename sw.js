/* Service Worker: アプリ本体をキャッシュしオフライン起動を可能にする。
 * 天気APIのレスポンスはキャッシュせず常に最新を取得する。 */
const CACHE = "weather3spots-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 天気・地名APIはネットワーク優先（キャッシュしない）
  if (url.hostname.endsWith("open-meteo.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response("{}", { status: 503 })));
    return;
  }

  // アプリ本体はキャッシュ優先、無ければネットワーク
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
