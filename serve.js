// Máy chủ tĩnh tối giản để chạy thử trên máy tính: node serve.js  →  http://localhost:5180
// (File .gz được trả nguyên dạng nén — bộ đọc chữ tự giải nén.)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = +process.env.PORT || 5180;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`NutriLens: http://localhost:${PORT}`));
