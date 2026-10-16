const $ = (id) => document.getElementById(id);
const els = {
  q: $('q'), category: $('category'), language: $('language'), sort: $('sort'), minStars: $('minStars'),
  grid: $('grid'), empty: $('empty'), stats: $('stats'), status: $('status'), refresh: $('refresh'), theme: $('theme'),
};
const tpl = $('card');

const LANG_COLORS = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8',
  'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', Swift: '#F05138', 'C#': '#178600', Kotlin: '#A97BFF', MDX: '#fcb32c',
};

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const relTime = (iso) => {
  if (!iso) return '—';
  const days = Math.round((Date.now() - new Date(iso)) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};

let facetsLoaded = false;
// Filters from the URL on first load. The category/language <select>s have no
// options until the first response arrives, so until then read these instead.
const initial = Object.fromEntries(new URLSearchParams(location.search));

function readState() {
  const fromSelect = (k) => (facetsLoaded ? els[k].value : (initial[k] || ''));
  return {
    q: els.q.value, category: fromSelect('category'), language: fromSelect('language'),
    sort: els.sort.value, minStars: els.minStars.value,
  };
}

function writeUrl(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && v !== '0' && !(k === 'sort' && v === 'stars')) p.set(k, v);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function readUrl() {
  for (const k of ['q', 'sort', 'minStars']) if (initial[k] != null) els[k].value = initial[k];
}

function fillSelect(select, options, current) {
  const first = select.options[0];
  select.replaceChildren(first);
  for (const { value, label, count } of options) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = count != null ? `${label ?? value} (${count})` : (label ?? value);
    select.append(o);
  }
  select.value = current;
  if (select.value !== current) select.value = '';
}

function render(items) {
  els.grid.replaceChildren(...items.map((r) => {
    const n = tpl.content.cloneNode(true);
    const title = n.querySelector('.card-title');
    title.href = r.url;
    title.innerHTML = `<span class="owner">${esc(r.owner)}/</span>${esc(r.name)}`;
    n.querySelector('.category').textContent = r.categoryLabel;
    n.querySelector('.card-desc').textContent = r.description || 'No description.';
    n.querySelector('.topics').replaceChildren(...r.topics.slice(0, 6).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
    n.querySelector('.stars b').textContent = fmt.format(r.stars);
    n.querySelector('.forks b').textContent = fmt.format(r.forks);
    const lang = n.querySelector('.lang');
    if (r.language) { lang.querySelector('b').textContent = r.language; lang.querySelector('.dot').style.background = LANG_COLORS[r.language] || '#999'; }
    else lang.remove();
    const lic = n.querySelector('.license');
    if (r.license) lic.querySelector('b').textContent = r.license; else lic.remove();
    n.querySelector('.updated b').textContent = relTime(r.updatedAt);
    return n;
  }));
  els.empty.hidden = items.length > 0;
}

function renderStats(items) {
  const stars = items.reduce((s, r) => s + r.stars, 0);
  const langs = new Set(items.map((r) => r.language).filter(Boolean)).size;
  const tiles = [[items.length, 'repositories'], [fmt.format(stars), 'combined stars'], [langs, 'languages']];
  els.stats.replaceChildren(...tiles.map(([n, l]) => {
    const d = document.createElement('div'); d.className = 'stat-tile';
    d.innerHTML = `<span class="n">${n}</span><span class="l">${l}</span>`; return d;
  }));
}

function showStatus(meta) {
  if (meta.source === 'seed') {
    els.status.className = 'status warn';
    els.status.textContent = `Showing bundled snapshot data. Live GitHub fetch failed: ${meta.warning || 'unknown error'}`;
    els.status.hidden = false;
  } else if (meta.warning) {
    els.status.className = 'status info';
    els.status.textContent = `Live data (some searches were skipped: ${meta.warning})`;
    els.status.hidden = false;
  } else {
    els.status.hidden = true;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let inflight;
async function load({ refresh = false } = {}) {
  const state = readState();
  writeUrl(state);
  const params = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
  if (refresh) params.set('refresh', '1');
  inflight?.abort();
  inflight = new AbortController();
  els.refresh.disabled = true;
  try {
    const res = await fetch(`/api/repos?${params}`, { signal: inflight.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const labels = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));
    if (!facetsLoaded || refresh) {
      fillSelect(els.category, data.facets.categories.map((c) => ({ value: c.value, label: labels[c.value] || c.value, count: c.count })), state.category);
      fillSelect(els.language, data.facets.languages.filter((l) => l.value !== 'Other').map((l) => ({ value: l.value, count: l.count })), state.language);
      facetsLoaded = true;
    }
    render(data.items.map((r) => ({ ...r, categoryLabel: labels[r.category] || r.category })));
    renderStats(data.items);
    showStatus(data.meta);
  } catch (err) {
    if (err.name === 'AbortError') return;
    els.status.className = 'status warn';
    els.status.textContent = `Could not load repositories: ${err.message}`;
    els.status.hidden = false;
  } finally {
    els.refresh.disabled = false;
  }
}

let timer;
els.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
for (const k of ['category', 'language', 'sort', 'minStars']) els[k].addEventListener('change', () => load());
els.refresh.addEventListener('click', () => load({ refresh: true }));

els.theme.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  els.theme.textContent = dark ? '🌙' : '☀️';
  try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch {}
});
try {
  const saved = localStorage.getItem('theme');
  if (saved) { document.documentElement.dataset.theme = saved; els.theme.textContent = saved === 'dark' ? '☀️' : '🌙'; }
} catch {}

readUrl();
load();
