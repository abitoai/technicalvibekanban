// Reconciles the on-disk vector index against ~/.claude/projects/**/*.jsonl.
// Diff plan: new sessions, appended turns, rewritten files, deleted files.
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { loadIndex, saveIndex } from './store.js';
import { chunkSession, countLines, headHash } from './chunker.js';
import { embed, EMBED_DIM, EMBEDDER_ID } from './embedder.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// Read .meta.json sidecar for richer session-level chunks.
async function readMeta(repoId, sessionId) {
  try {
    const path = join(PROJECTS_DIR, repoId, `${sessionId}.meta.json`);
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return {};
  }
}

async function listSessionsOnDisk() {
  const map = new Map();
  let entries;
  try {
    entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read ${PROJECTS_DIR}: ${err.message}`);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(PROJECTS_DIR, entry.name);
    let files;
    try { files = await readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const sessionId = basename(f, '.jsonl');
      map.set(sessionId, { repoId: entry.name, filePath: join(dir, f) });
    }
  }
  return map;
}

export async function reconcile({ dryRun = false, log = console.log } = {}) {
  const start = Date.now();
  const idx = await loadIndex();
  if (!idx.embedder) idx.embedder = EMBEDDER_ID;
  if (!idx.dim) idx.dim = EMBED_DIM;

  const report = {
    dryRun,
    embedder: idx.embedder,
    dim: idx.dim,
    onDisk: 0,
    inIndex: Object.keys(idx.sessions).length,
    plan: { new: 0, appended: 0, rewritten: 0, noop: 0, deleted: 0 },
    embeddedChunks: 0,
    deletedChunks: 0,
    errors: [],
    durationMs: 0,
  };

  const onDisk = await listSessionsOnDisk();
  report.onDisk = onDisk.size;
  log(`[reconcile] ${onDisk.size} sessions on disk, ${report.inIndex} in index`);

  // Detect deletions (in index but no longer on disk)
  for (const sessionId of Object.keys(idx.sessions)) {
    if (onDisk.has(sessionId)) continue;
    const before = idx.chunks.length;
    if (!dryRun) idx.chunks = idx.chunks.filter(c => c.sessionId !== sessionId);
    report.deletedChunks += (before - (dryRun ? before : idx.chunks.length));
    if (!dryRun) delete idx.sessions[sessionId];
    report.plan.deleted++;
  }

  // Walk on-disk sessions
  let processed = 0;
  for (const [sessionId, { repoId, filePath }] of onDisk) {
    processed++;
    try {
      const lineCount = await countLines(filePath);
      const hash = await headHash(filePath);
      const existing = idx.sessions[sessionId];

      let action;
      if (!existing) action = 'new';
      else if (existing.headHash !== hash) action = 'rewrite';
      else if (lineCount > (existing.lastIndexedLineCount || 0)) action = 'append';
      else action = 'noop';

      report.plan[action]++;

      if (action === 'noop') continue;

      const meta = await readMeta(repoId, sessionId);
      const metaInfo = {
        customName: meta.custom_name || null,
        summary: meta.summary || null,
        brief: meta.brief || null,
      };
      const { sessionText, turns } = await chunkSession(filePath, metaInfo);

      const lastTurnIndexed = action === 'append' ? (existing.lastIndexedTurnCount || 0) : 0;
      const newTurns = turns.filter(t => t.turnIndex >= lastTurnIndexed);

      if (dryRun) {
        // tally only
        if (action === 'new' || action === 'rewrite') {
          if (sessionText) report.embeddedChunks++;
        }
        report.embeddedChunks += newTurns.length;
        continue;
      }

      // Wipe existing chunks for this session if rewriting
      if (action === 'rewrite') {
        const before = idx.chunks.length;
        idx.chunks = idx.chunks.filter(c => c.sessionId !== sessionId);
        report.deletedChunks += (before - idx.chunks.length);
      }

      // Session-level chunk only on new/rewrite
      if ((action === 'new' || action === 'rewrite') && sessionText) {
        const vec = await embed(sessionText);
        idx.chunks.push({
          id: `${sessionId}:session`,
          sessionId, repoId, kind: 'session',
          text: sessionText,
          vector: vec,
          createdAt: new Date().toISOString(),
        });
        report.embeddedChunks++;
      }

      for (const turn of newTurns) {
        const vec = await embed(turn.text);
        idx.chunks.push({
          id: `${sessionId}:turn:${turn.turnIndex}`,
          sessionId, repoId, kind: 'turn',
          turnIndex: turn.turnIndex,
          text: turn.text,
          vector: vec,
          createdAt: new Date().toISOString(),
        });
        report.embeddedChunks++;
      }

      idx.sessions[sessionId] = {
        repoId,
        lastIndexedLineCount: lineCount,
        lastIndexedTurnCount: turns.length,
        headHash: hash,
        indexedAt: new Date().toISOString(),
      };

      if (processed % 25 === 0) {
        log(`[reconcile] ${processed}/${onDisk.size} sessions processed, ${report.embeddedChunks} chunks embedded so far`);
      }
    } catch (err) {
      report.errors.push(`${sessionId}: ${err.message}`);
    }
  }

  if (!dryRun) await saveIndex();
  report.durationMs = Date.now() - start;
  log(`[reconcile] done in ${(report.durationMs / 1000).toFixed(1)}s — plan=${JSON.stringify(report.plan)} embedded=${report.embeddedChunks} deleted=${report.deletedChunks} errors=${report.errors.length}`);
  return report;
}
