import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('serves the frontend', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /AI Assistant Repo Explorer/);
});

test('blocks path traversal', async () => {
  const res = await fetch(`${base}/../package.json`);
  assert.notEqual(res.status, 200);
});

test('/api/repos returns items, facets and meta', async () => {
  const res = await fetch(`${base}/api/repos?sort=stars`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.items) && body.items.length > 0);
  assert.ok(body.facets.languages.length > 0);
  assert.ok(['github', 'seed'].includes(body.meta.source));
  for (let i = 1; i < body.items.length; i++) assert.ok(body.items[i - 1].stars >= body.items[i].stars);
});

test('/api/repos applies filters', async () => {
  const res = await fetch(`${base}/api/repos?language=Rust`);
  const body = await res.json();
  assert.ok(body.items.length > 0);
  assert.ok(body.items.every((r) => r.language === 'Rust'));
});

test('/api/health reports cache state', async () => {
  const body = await (await fetch(`${base}/api/health`)).json();
  assert.equal(body.ok, true);
  assert.ok(body.count > 0);
});

test('unknown routes 404', async () => {
  assert.equal((await fetch(`${base}/nope.txt`)).status, 404);
});
