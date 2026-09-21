// Minimal local static server. Binds to 127.0.0.1 only - the dashboard is never
// exposed on the network, and it makes no outbound requests.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, DATASET_FILE, DEMO_FILE, OVERRIDES_FILE, readJSON } from './dataset.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

const WEB = path.join(ROOT, 'web');

/**
 * Ask the operating system to open a URL in the default browser.
 * Local only: this hands a loopback address to the platform's own opener and
 * never reaches the network itself. Failure is not an error - the URL is printed
 * either way.
 */
function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no opener available; the printed URL is the fallback */ });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function startServer({ port = 4178, open = false } = {}) {
  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      send(res, 500, { 'content-type': 'text/plain' }, `Server error: ${err.message}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try: npm start -- --port ${port + 1}`));
      } else reject(err);
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}/`;
      if (open) openInBrowser(url);
      resolve(url);
    });
  });
}

function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/state') {
    const hasReal = fs.existsSync(DATASET_FILE);
    const ds = hasReal ? readJSON(DATASET_FILE) : null;
    return send(res, 200, { 'content-type': TYPES['.json'] }, JSON.stringify({
      hasRealData: hasReal && (ds?.contributions?.length ?? 0) > 0,
      datasetPresent: hasReal,
      demoAvailable: fs.existsSync(DEMO_FILE),
      corrections: (readJSON(OVERRIDES_FILE, { entries: [] }).entries ?? []).length,
      lastSuccessfulRefresh: ds?.lastSuccessfulRefresh ?? null,
      datasetVersion: ds?.datasetVersion ?? 0
    }));
  }

  if (pathname === '/api/portfolio') {
    if (!fs.existsSync(DATASET_FILE)) return send(res, 404, { 'content-type': TYPES['.json'] }, '{"error":"no dataset"}');
    return sendFile(res, DATASET_FILE);
  }

  if (pathname === '/api/demo') {
    if (!fs.existsSync(DEMO_FILE)) return send(res, 404, { 'content-type': TYPES['.json'] }, '{"error":"no demo"}');
    return sendFile(res, DEMO_FILE);
  }

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(WEB, rel);
  // Never serve outside web/.
  if (!file.startsWith(WEB + path.sep) && file !== path.join(WEB, 'index.html')) {
    return send(res, 403, { 'content-type': 'text/plain' }, 'Forbidden');
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, { 'content-type': 'text/plain' }, 'Not found');
  }
  return sendFile(res, file);
}

function sendFile(res, file) {
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function send(res, code, headers, body) {
  res.writeHead(code, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}
