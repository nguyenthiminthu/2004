// Service worker: cho phép cài app lên điện thoại và mở được khi mạng chập chờn.
// Đổi VERSION mỗi lần cập nhật app để điện thoại tải bản mới.
const VERSION = "thm-okr-v5";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/app.css",
  "./js/config.js", "./js/data.js", "./js/charts.js", "./js/export-xlsx.js", "./js/app.js",
  "./vendor/chart.umd.min.js", "./vendor/supabase.js", "./vendor/exceljs.min.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Chỉ xử lý file của app (cùng tên miền). Dữ liệu Supabase luôn đi thẳng lên mạng, không lưu đệm.
// Mạng trước – nếu mất mạng thì dùng bản đã lưu.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
