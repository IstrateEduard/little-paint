import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const requested = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!requested.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
    const content = await fs.readFile(requested);
    response.writeHead(200, { 'Content-Type': types[path.extname(requested)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(5173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5173'));
