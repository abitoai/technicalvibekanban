// Hybrid retrieval: BM25 + vector cosine, fused with Reciprocal Rank Fusion (RRF).
// Same entry point used by the search UI and the Q&A endpoint.
import { loadIndex } from './store.js';
import { buildBM25 } from './bm25.js';
import { embed } from './embedder.js';

const RRF_K = 60; // standard constant; score = Σ 1/(K + rank)

function cosineSearch(vectors, queryVec, k) {
  const scores = [];
  for (const chunk of vectors) {
    const v = chunk.vector;
    if (!v || v.length !== queryVec.length) continue;
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * queryVec[i];
    scores.push([chunk.id, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, k);
}

function rrfFuse(lists, k) {
  // lists: Array<Array<[docId, score]>>
  // Output: top-k by RRF score
  const combined = new Map();
  for (const list of lists) {
    list.forEach(([docId], rank) => {
      combined.set(docId, (combined.get(docId) || 0) + 1 / (RRF_K + rank + 1));
    });
  }
  const sorted = [...combined.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, k);
}

function snippet(text, maxLen = 320) {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed;
}

// mode: 'hybrid' | 'vector' | 'bm25'
// kind: null | 'session' | 'turn' — optional filter
export async function search(query, { k = 10, mode = 'hybrid', kind = null } = {}) {
  if (!query?.trim()) return { hits: [], mode, total: 0 };
  const idx = await loadIndex();
  let pool = idx.chunks;
  if (kind) pool = pool.filter((c) => c.kind === kind);
  if (pool.length === 0) return { hits: [], mode, total: 0 };

  let bmRanked = [];
  let vecRanked = [];

  if (mode === 'bm25' || mode === 'hybrid') {
    const bm = buildBM25(idx);
    // BM25 is built over full index; filter by kind after scoring
    const raw = bm.search(query, Math.max(30, k * 4));
    const allowed = kind ? new Set(pool.map((c) => c.id)) : null;
    bmRanked = allowed ? raw.filter(([id]) => allowed.has(id)) : raw;
  }

  if (mode === 'vector' || mode === 'hybrid') {
    const qVec = await embed(query);
    vecRanked = cosineSearch(pool, qVec, Math.max(30, k * 4));
  }

  let ranking;
  if (mode === 'bm25') ranking = bmRanked.slice(0, k);
  else if (mode === 'vector') ranking = vecRanked.slice(0, k);
  else ranking = rrfFuse([bmRanked, vecRanked], k);

  const byId = new Map(idx.chunks.map((c) => [c.id, c]));
  const hits = ranking
    .map(([id, score]) => {
      const c = byId.get(id);
      if (!c) return null;
      return {
        id: c.id,
        sessionId: c.sessionId,
        repoId: c.repoId,
        kind: c.kind,
        turnIndex: c.turnIndex ?? null,
        score,
        snippet: snippet(c.text),
      };
    })
    .filter(Boolean);

  return { hits, mode, total: pool.length };
}

// Build a compact retrieval context for the Ask endpoint.
// Returns { contextText, citations: [{n, sessionId, repoId, kind, snippet, title?}] }
export async function retrieve(query, k = 8) {
  const { hits } = await search(query, { k, mode: 'hybrid' });
  const idx = await loadIndex();
  const byId = new Map(idx.chunks.map((c) => [c.id, c]));

  const lines = [];
  const citations = [];
  hits.forEach((h, i) => {
    const c = byId.get(h.id);
    const title = c ? `session ${c.sessionId}` : h.sessionId;
    const repo = h.repoId || 'unknown';
    const header = `[${i + 1}] ${h.kind} from ${title} (repo: ${repo})`;
    lines.push(header + '\n' + (c?.text || h.snippet));
    citations.push({
      n: i + 1,
      sessionId: h.sessionId,
      repoId: h.repoId,
      kind: h.kind,
      snippet: h.snippet,
    });
  });

  return {
    contextText: lines.join('\n\n---\n\n'),
    citations,
  };
}
