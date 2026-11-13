/* NutriLens — service worker: tải sẵn toàn bộ app (kể cả bộ đọc chữ OCR) để chạy không cần mạng.
   Đổi VERSION mỗi lần sửa file để máy đã cài nhận bản mới. */
const VERSION = 'nutrilens-v20';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/db.js', 'js/recipes.js', 'js/logic.js', 'js/vision.js', 'js/app.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/lang/vie.traineddata.gz', 'vendor/tesseract/lang/eng.traineddata.gz',
  'vendor/vision/vision_bundle.mjs', 'vendor/vision/wasm/vision_wasm_internal.js', 'vendor/vision/wasm/vision_wasm_internal.wasm',
  'vendor/model/food_v1.tflite', 'vendor/model/labels.json',
  // Bộ phân tích kỹ (vendor/tfjs, vendor/vlm ≈ 230 MB) KHÔNG tải sẵn: chỉ tải khi người dùng bật, thư viện tự lưu vào 'transformers-cache'.
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('nutrilens-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Thêm header "cách ly nguồn gốc" vào mọi phản hồi → trình duyệt cho phép WASM chạy đa luồng (nhanh hơn 3–4 lần), kể cả khi host tĩnh không đặt được header.
function iso(res) {
  if (!res || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin'); h.set('Cross-Origin-Embedder-Policy', 'require-corp'); h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response([101, 204, 205, 304].includes(res.status) ? null : res.body, { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/vlm/')) return; // model lớn: để thư viện tự tải và tự lưu
  const put = res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };
  const heavy = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');
  if (heavy) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit ? iso(hit) : fetch(req).then(put).then(iso)).catch(() => Response.error()));
  } else {
    // phần vỏ app: mạng trước → luôn nhận bản sửa mới nhất chỉ với một lần tải lại; mất mạng thì dùng bản đã lưu
    e.respondWith(fetch(req, { cache: 'no-store' }).then(put).then(iso).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit ? iso(hit) : req.mode === 'navigate' ? caches.match('index.html').then(iso) : Response.error())));
  }
});
