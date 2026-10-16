/**
 * Zero-dependency HTTP server: serves the static frontend from /public and
 * a small JSON API backed by GitHub search with seed-data fallback.
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepos, cacheState } from './github.js';
import { query, facets, CATEGORIES } from './repos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const TTL_MS = (Number(process.env.CACHE_TTL) || 600) * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

export async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/repos') {
    const force = url.searchParams.get('refresh') === '1';
    const data = await getRepos({ ttlMs: TTL_MS, force });
    const opts = Object.fromEntries(url.searchParams);
    const items = query(data.repos, opts);
    return json(res, 200, {
      items,
      total: items.length,
      facets: facets(data.repos),
      categories: CATEGORIES,
      meta: { source: data.source, fetchedAt: data.fetchedAt, cached: data.cached, warning: data.error },
    });
  }
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, ...cacheState() });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
  return serveStatic(res, url.pathname);
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      json(res, 500, { error: err.message });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`AI Assistant Repo Explorer listening on http://localhost:${PORT}`);
    console.log(process.env.GITHUB_TOKEN ? 'Using GITHUB_TOKEN for higher rate limits.' : 'No GITHUB_TOKEN set; using unauthenticated GitHub API (10 searches/min).');
  });
}
