// Flat-JSON vector index at ~/.claude/vibekanban-index.json.
// Schema is intentionally simple — pluggable backend (sqlite-vec, etc.) can swap behind these helpers later.
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

const INDEX_PATH = join(homedir(), '.claude', 'vibekanban-index.json');
const VERSION = 1;

let cache = null;

function blank() {
  return {
    version: VERSION,
    embedder: null,
    dim: null,
    sessions: {}, // sessionId -> { repoId, lastIndexedLineCount, lastIndexedTurnCount, headHash, indexedAt }
    chunks: [],   // [{ id, sessionId, repoId, kind, turnIndex?, text, vector, createdAt }]
  };
}

export async function loadIndex() {
  if (cache) return cache;
  try {
    const data = JSON.parse(await readFile(INDEX_PATH, 'utf-8'));
    if (data.version !== VERSION) {
      console.warn(`[index] stored version ${data.version} != ${VERSION}, rebuilding`);
      cache = blank();
    } else {
      cache = data;
    }
  } catch {
    cache = blank();
  }
  return cache;
}

export async function saveIndex() {
  if (!cache) return;
  await mkdir(dirname(INDEX_PATH), { recursive: true });
  // Serialize once at the end of a reconcile — chunks/vectors are already plain JSON-friendly
  await writeFile(INDEX_PATH, JSON.stringify(cache));
}

export async function getStatus() {
  const idx = await loadIndex();
  return {
    path: INDEX_PATH,
    version: idx.version,
    embedder: idx.embedder,
    dim: idx.dim,
    sessionCount: Object.keys(idx.sessions).length,
    chunkCount: idx.chunks.length,
    sessionChunks: idx.chunks.filter(c => c.kind === 'session').length,
    turnChunks: idx.chunks.filter(c => c.kind === 'turn').length,
  };
}

export const INDEX_FILE_PATH = INDEX_PATH;
