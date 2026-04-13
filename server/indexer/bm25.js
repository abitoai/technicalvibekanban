// Hand-rolled BM25 over chunk text. Built from in-memory chunks on demand; no persistence.
// Standard parameters: k1=1.5, b=0.75. Tokenization preserves identifiers
// like "src/api/auth.ts" and "ECONNRESET" intact (doesn't split on / or _ or .).

const K1 = 1.5;
const B = 0.75;

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-./\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

export class BM25 {
  constructor() {
    this.docs = new Map();   // docId -> { tf: Map<term,count>, len: number }
    this.df = new Map();     // term -> number of docs containing it
    this.totalLen = 0;
    this.idf = null;         // lazy-computed
  }

  add(docId, text) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    this.docs.set(docId, { tf, len: tokens.length });
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.totalLen += tokens.length;
    this.idf = null;
  }

  _computeIdf() {
    const N = this.docs.size;
    this.idf = new Map();
    for (const [term, n] of this.df) {
      this.idf.set(term, Math.log((N - n + 0.5) / (n + 0.5) + 1));
    }
  }

  search(query, k = 30) {
    if (!this.idf) this._computeIdf();
    const N = this.docs.size;
    if (!N) return [];
    const avgdl = this.totalLen / N;
    const qTerms = [...new Set(tokenize(query))];
    const scores = [];
    for (const [docId, doc] of this.docs) {
      let score = 0;
      for (const t of qTerms) {
        const idf = this.idf.get(t);
        if (!idf) continue;
        const f = doc.tf.get(t);
        if (!f) continue;
        const numer = f * (K1 + 1);
        const denom = f + K1 * (1 - B + B * doc.len / avgdl);
        score += idf * (numer / denom);
      }
      if (score > 0) scores.push([docId, score]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    return scores.slice(0, k);
  }
}

// Lazy singleton keyed by the loaded index object identity — invalidated by search.js when the index changes.
let cached = null;
export function buildBM25(index) {
  if (cached && cached.owner === index) return cached.bm25;
  const bm25 = new BM25();
  for (const chunk of index.chunks) bm25.add(chunk.id, chunk.text);
  cached = { owner: index, bm25 };
  return bm25;
}

export function invalidateBM25() {
  cached = null;
}
