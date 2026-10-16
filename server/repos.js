/**
 * Pure helpers for the repo explorer: normalisation, categorisation,
 * filtering and sorting. No I/O here so everything is unit-testable.
 */

/** Curated GitHub search queries that together cover the AI-assistant space. */
export const SEARCH_QUERIES = [
  'topic:ai-assistant stars:>3000',
  'ai assistant in:description stars:>15000',
  'topic:llm topic:chatbot stars:>8000',
  'topic:chatgpt stars:>20000',
  'topic:ai-agents stars:>10000',
  'coding assistant in:description stars:>5000',
];

/** Category rules, checked in order. First match wins. Topics on GitHub are
 * noisy (nearly everything is tagged "chatgpt"/"chatbot"), so rules lean on
 * descriptions and a small set of precise topics. */
const CATEGORY_RULES = [
  {
    id: 'learning',
    label: 'Learning & prompts',
    test: (r) => has(r, ['awesome-list', 'awesome', 'chatgpt-prompts', 'ai-prompts', 'course', 'tutorial', 'cookbook', 'academic'])
      || /\b(awesome|curated list|lessons?|courses?|tutorials?|cookbook|guides?|prompts?|papers)\b/i.test(r.description),
  },
  {
    id: 'coding',
    label: 'Coding assistant',
    test: (r) => has(r, ['coding-assistant', 'coding-agent', 'code-assistant', 'developer-tools', 'codegen', 'github-copilot', 'ide'])
      || /\b(coding|code completion|ai-driven development|developer|xcode|spec-driven|repository into)\b/i.test(r.description),
  },
  {
    id: 'assistant',
    label: 'Personal assistant',
    test: (r) => has(r, ['personal-ai', 'personal-assistant', 'ai-meeting-assistant', 'chat-assistant'])
      || /\b(personal (ai )?assistant|assistant infrastructure|meeting assistant|decision assistant|agent that grows with you|companion|alternative to .*bot|whatsapp|telegram)\b/i.test(r.description),
  },
  {
    id: 'framework',
    label: 'Agent framework',
    // Precise framework topics win over the looser chat/knowledge description matches below.
    test: (r) => has(r, ['agent-framework', 'agentic-framework', 'llm-framework', 'agent-harness', 'multi-agent', 'multiagent', 'agent-orchestration']),
  },
  {
    id: 'chat',
    label: 'Chat UI & desktop',
    test: (r) => has(r, ['chat', 'chat-ui', 'desktop-app', 'electron', 'tauri', 'web-ui'])
      || /chat/i.test(r.name)
      || /\b(chat assistant|chat app|chat client|chat ui|smart chat|chat-repl|desktop|studio|web ui|local ui|cli tool|on-screen)\b/i.test(r.description),
  },
  {
    id: 'knowledge',
    label: 'Knowledge & RAG',
    test: (r) => has(r, ['rag', 'knowledgebase', 'knowledge-base', 'retrieval', 'vector-database', 'agentic-memory', 'embeddings', 'embedding', 'document-qa'])
      || /\b(rag|knowledge|memory layer|documents?|data assistant|search and monitoring|retrieval)\b/i.test(r.description),
  },
  {
    id: 'framework',
    label: 'Agent framework',
    test: (r) => has(r, ['low-code', 'no-code'])
      || /\b(framework|harness|orchestrat\w*|swarms?|build(ing)? (and|&) (run|deploy)\w*|platform|workflows?|low-code|no-code|stack|engine|devops|hub to build|agent engineering|production system)\b/i.test(r.description),
  },
  {
    id: 'other',
    label: 'Tools & other',
    test: () => true,
  },
];

export const CATEGORIES = [...new Map(CATEGORY_RULES.map(({ id, label }) => [id, { id, label }])).values()];

function has(repo, keywords) {
  const topics = (repo.topics || []).map((t) => String(t).toLowerCase());
  const name = String(repo.name || '').toLowerCase();
  return keywords.some((k) => topics.includes(k) || name.includes(k));
}

/** Assign a single category id to a repo. */
export function categorize(repo) {
  const r = { ...repo, description: repo.description || '', topics: repo.topics || [] };
  return CATEGORY_RULES.find((rule) => rule.test(r)).id;
}

/** Convert a raw GitHub API repository object into the shape the UI uses. */
export function normalize(raw) {
  return {
    fullName: raw.full_name,
    name: raw.name,
    owner: raw.owner?.login ?? raw.full_name?.split('/')[0] ?? '',
    description: raw.description || '',
    url: raw.html_url,
    homepage: raw.homepage || '',
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    language: raw.language || null,
    topics: (raw.topics || []).slice(0, 8),
    license: raw.license?.spdx_id && raw.license.spdx_id !== 'NOASSERTION' ? raw.license.spdx_id : null,
    updatedAt: raw.pushed_at || raw.updated_at || null,
  };
}

/** Merge multiple result lists, dropping duplicates by fullName. Later lists win, so pass fresher data last. */
export function dedupe(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const repo of list) map.set(repo.fullName, repo);
  }
  return [...map.values()];
}

/** Attach category + a normalised seed-license (seed files may carry NOASSERTION). */
export function enrich(repos) {
  return repos.map((r) => ({
    ...r,
    license: r.license === 'NOASSERTION' ? null : r.license,
    category: categorize(r),
  }));
}

const SORTERS = {
  stars: (a, b) => b.stars - a.stars,
  forks: (a, b) => b.forks - a.forks,
  updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
  name: (a, b) => a.fullName.localeCompare(b.fullName),
};

/**
 * Filter and sort an enriched repo list.
 * @param {object[]} repos
 * @param {{q?: string, language?: string, category?: string, sort?: string, minStars?: number}} opts
 */
export function query(repos, opts = {}) {
  const q = (opts.q || '').trim().toLowerCase();
  const language = (opts.language || '').toLowerCase();
  const category = opts.category || '';
  const minStars = Number(opts.minStars) || 0;
  const sorter = SORTERS[opts.sort] || SORTERS.stars;

  return repos
    .filter((r) => !q
      || r.fullName.toLowerCase().includes(q)
      || r.description.toLowerCase().includes(q)
      || r.topics.some((t) => t.toLowerCase().includes(q)))
    .filter((r) => !language || (r.language || '').toLowerCase() === language)
    .filter((r) => !category || r.category === category)
    .filter((r) => r.stars >= minStars)
    .sort(sorter);
}

/** Summary facets for the UI: languages and categories with counts. */
export function facets(repos) {
  const count = (key) => {
    const m = new Map();
    for (const r of repos) {
      const k = r[key] || 'Other';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, count: n }));
  };
  return { languages: count('language'), categories: count('category') };
}
