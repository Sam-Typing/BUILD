/**
 * GitHub data source. Fetches the curated searches live, caches the merged
 * result in memory, and falls back to the bundled seed data when GitHub is
 * unreachable or rate-limited so the app always has something to show.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SEARCH_QUERIES, normalize, dedupe, enrich } from './repos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');
const API = 'https://api.github.com/search/repositories';

const cache = { repos: null, fetchedAt: 0, source: 'none', error: null };

export async function loadSeed() {
  const text = await readFile(SEED_PATH, 'utf8');
  return enrich(JSON.parse(text));
}

let tokenRejected = false;

function headers({ withToken = true } = {}) {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-assistant-repo-explorer',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (withToken && process.env.GITHUB_TOKEN && !tokenRejected) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Short, single-line summary of a GitHub error body for the UI. */
function describeError(status, body) {
  let message = '';
  try { message = JSON.parse(body).message || ''; } catch { message = body; }
  return `${status} ${message.replace(/\s+/g, ' ').trim().slice(0, 120)}`.trim();
}

async function searchOnce(q, perPage = 30) {
  const url = `${API}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`;
  let res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(10_000) });
  if (res.status === 401 && process.env.GITHUB_TOKEN && !tokenRejected) {
    // A bad token is worse than none: fall back to unauthenticated requests for the rest of the run.
    tokenRejected = true;
    console.warn('GITHUB_TOKEN was rejected (401); continuing without authentication.');
    res = await fetch(url, { headers: headers({ withToken: false }), signal: AbortSignal.timeout(10_000) });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${describeError(res.status, body)} for "${q}"`);
  }
  const json = await res.json();
  return (json.items || []).map(normalize);
}

/** Check the token once before fanning out so a bad one is dropped for every query, not just the first. */
async function ensureAuth() {
  if (!process.env.GITHUB_TOKEN || tokenRejected) return;
  const res = await fetch('https://api.github.com/rate_limit', { headers: headers(), signal: AbortSignal.timeout(10_000) });
  if (res.status === 401) {
    tokenRejected = true;
    console.warn('GITHUB_TOKEN was rejected (401); continuing without authentication.');
  }
}

/**
 * Run every curated query; tolerate individual failures as long as one succeeds.
 * Live results are layered on top of the bundled seed so a partial fetch
 * (rate limit, one failed query) never shrinks the list.
 */
export async function fetchLive() {
  await ensureAuth();
  const settled = await Promise.allSettled(SEARCH_QUERIES.map((q) => searchOnce(q)));
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const errors = settled.filter((s) => s.status === 'rejected').map((s) => s.reason?.message || String(s.reason));
  if (ok.length === 0) throw new Error(errors.join(' | ') || 'all searches failed');
  const seed = await loadSeed().catch(() => []);
  return { repos: enrich(dedupe([seed, ...ok])), errors };
}

/**
 * Return repos, preferring a fresh live fetch, then the cache, then the seed.
 * @param {{ttlMs?: number, force?: boolean}} opts
 */
export async function getRepos({ ttlMs = 600_000, force = false } = {}) {
  const fresh = cache.repos && Date.now() - cache.fetchedAt < ttlMs;
  if (fresh && !force) return { ...cache, cached: true };

  try {
    const { repos, errors } = await fetchLive();
    Object.assign(cache, { repos, fetchedAt: Date.now(), source: 'github', error: errors.length ? errors.join(' | ') : null });
    return { ...cache, cached: false };
  } catch (err) {
    if (cache.repos) {
      cache.error = err.message;
      return { ...cache, cached: true };
    }
    const repos = await loadSeed();
    Object.assign(cache, { repos, fetchedAt: Date.now(), source: 'seed', error: err.message });
    return { ...cache, cached: false };
  }
}

export function cacheState() {
  return { source: cache.source, fetchedAt: cache.fetchedAt, error: cache.error, count: cache.repos?.length ?? 0 };
}
