import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, normalize, dedupe, enrich, query, facets, CATEGORIES } from '../server/repos.js';
import { loadSeed } from '../server/github.js';

test('normalize maps GitHub API fields', () => {
  const r = normalize({
    full_name: 'acme/bot', name: 'bot', owner: { login: 'acme' }, description: null, html_url: 'https://github.com/acme/bot',
    stargazers_count: 10, forks_count: 2, open_issues_count: 1, language: 'Go', topics: ['a', 'b'],
    license: { spdx_id: 'NOASSERTION' }, pushed_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(r.fullName, 'acme/bot');
  assert.equal(r.owner, 'acme');
  assert.equal(r.description, '');
  assert.equal(r.license, null);
  assert.equal(r.updatedAt, '2026-01-01T00:00:00Z');
  assert.deepEqual(r.topics, ['a', 'b']);
});

test('categorize assigns sensible buckets', () => {
  assert.equal(categorize({ name: 'awesome-ai-tools', description: 'A curated list of AI tools', topics: [] }), 'learning');
  assert.equal(categorize({ name: 'tabby', description: 'Self-hosted AI coding assistant', topics: [] }), 'coding');
  assert.equal(categorize({ name: 'mem0', description: 'Universal memory layer for AI agents', topics: ['memory'] }), 'knowledge');
  assert.equal(categorize({ name: 'langchain', description: 'The platform for reliable agents', topics: ['agent-framework'] }), 'framework');
  assert.equal(categorize({ name: 'NextChat', description: 'Zero-config AI chat assistant', topics: [] }), 'chat');
  assert.equal(categorize({ name: 'leon', description: 'Leon is your open-source personal assistant.', topics: [] }), 'assistant');
  assert.ok(CATEGORIES.some((c) => c.id === 'assistant'));
});

test('dedupe lets later (fresher) lists override earlier ones', () => {
  const out = dedupe([[{ fullName: 'a/b', stars: 9 }], [{ fullName: 'a/b', stars: 5 }, { fullName: 'c/d', stars: 1 }]]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.fullName === 'a/b').stars, 5);
});

const sample = enrich([
  { fullName: 'x/chatty', name: 'chatty', description: 'AI chat assistant', topics: ['chat'], language: 'TypeScript', stars: 500, forks: 50, updatedAt: '2026-10-01T00:00:00Z', license: 'MIT' },
  { fullName: 'y/agentkit', name: 'agentkit', description: 'Agent framework', topics: ['agents'], language: 'Python', stars: 900, forks: 10, updatedAt: '2025-01-01T00:00:00Z', license: 'NOASSERTION' },
  { fullName: 'z/notes', name: 'notes', description: 'RAG over your documents', topics: ['rag'], language: 'Python', stars: 100, forks: 80, updatedAt: '2026-05-01T00:00:00Z', license: null },
]);

test('enrich adds category and clears NOASSERTION license', () => {
  assert.equal(sample[1].license, null);
  assert.equal(sample[0].category, 'chat');
  assert.equal(sample[1].category, 'framework');
  assert.equal(sample[2].category, 'knowledge');
});

test('query filters by text, language, category and min stars', () => {
  assert.deepEqual(query(sample, { q: 'chat' }).map((r) => r.name), ['chatty']);
  assert.deepEqual(query(sample, { language: 'python' }).map((r) => r.name), ['agentkit', 'notes']);
  assert.deepEqual(query(sample, { category: 'knowledge' }).map((r) => r.name), ['notes']);
  assert.deepEqual(query(sample, { minStars: 400 }).map((r) => r.name), ['agentkit', 'chatty']);
  assert.deepEqual(query(sample, { q: 'rag' }).map((r) => r.name), ['notes']);
});

test('query sorts by stars, forks, updated and name', () => {
  assert.deepEqual(query(sample, { sort: 'stars' }).map((r) => r.name), ['agentkit', 'chatty', 'notes']);
  assert.deepEqual(query(sample, { sort: 'forks' }).map((r) => r.name), ['notes', 'chatty', 'agentkit']);
  assert.deepEqual(query(sample, { sort: 'updated' }).map((r) => r.name), ['chatty', 'notes', 'agentkit']);
  assert.deepEqual(query(sample, { sort: 'name' }).map((r) => r.name), ['chatty', 'agentkit', 'notes']);
  assert.deepEqual(query(sample, { sort: 'bogus' }).map((r) => r.name), ['agentkit', 'chatty', 'notes']);
});

test('facets count languages and categories', () => {
  const f = facets(sample);
  assert.deepEqual(f.languages[0], { value: 'Python', count: 2 });
  assert.equal(f.categories.length, 3);
});

test('bundled seed data loads and is well-formed', async () => {
  const seed = await loadSeed();
  assert.ok(seed.length >= 40, `expected a healthy seed, got ${seed.length}`);
  for (const r of seed) {
    assert.ok(r.fullName.includes('/'), r.fullName);
    assert.ok(typeof r.stars === 'number');
    assert.ok(r.url.startsWith('https://github.com/'));
    assert.ok(CATEGORIES.some((c) => c.id === r.category));
  }
});
