/** Re-fetch the curated searches from GitHub and overwrite data/seed.json. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLive } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'data', 'seed.json');

const { repos, errors } = await fetchLive();
const sorted = repos
  .map(({ category, ...rest }) => rest)
  .sort((a, b) => b.stars - a.stars);
await writeFile(out, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Wrote ${sorted.length} repos to ${out}`);
if (errors.length) console.warn('Some searches failed:', errors.join('\n'));
