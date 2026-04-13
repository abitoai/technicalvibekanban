import type { Repo, Session } from './types';

export async function fetchRepos(): Promise<Repo[]> {
  const res = await fetch('/api/repos');
  return res.json();
}

export async function fetchSessions(repoId: string): Promise<Session[]> {
  const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}/sessions`);
  return res.json();
}

export async function updateSessionMeta(
  sessionId: string,
  repoId: string,
  data: { status?: string; custom_name?: string }
): Promise<void> {
  await fetch(`/api/sessions/${sessionId}/meta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, repoId }),
  });
}

export async function resumeSession(
  sessionId: string,
  repoId: string,
  skipPermissions: boolean
): Promise<{ command: string; repoPath: string; repoPathExists: boolean }> {
  const res = await fetch(`/api/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId, skipPermissions }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to resume');
  return data;
}

export async function summarizeSession(
  sessionId: string,
  repoId: string,
  maxWords: number
): Promise<string> {
  const res = await fetch(`/api/sessions/${sessionId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, repoId, maxWords }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.summary;
}

export interface SessionDetails {
  sessionId: string;
  gitBranch: string | null;
  cwd: string | null;
  firstMessage: string | null;
  lastMessage: string | null;
  durationSeconds: number | null;
  messageCount: number;
  toolCounts: Record<string, number>;
  touchedFileCount: number;
  fileGroups: Array<{
    dir: string;
    count: number;
    files: Array<{ file: string; reads: number; writes: number; edits: number }>;
  }>;
  forkedFrom: { sessionId: string; messageUuid: string } | null;
  children: Array<{ sessionId: string; created: string | null }>;
}

export async function fetchSessionDetails(
  sessionId: string,
  repoId: string
): Promise<SessionDetails> {
  const res = await fetch(
    `/api/sessions/${sessionId}/details?repoId=${encodeURIComponent(repoId)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load details');
  return data;
}

export async function generateBrief(sessionId: string, repoId: string): Promise<string> {
  const res = await fetch(`/api/sessions/${sessionId}/brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate brief');
  return data.brief;
}

export async function extractDecisions(sessionId: string, repoId: string): Promise<string> {
  const res = await fetch(`/api/sessions/${sessionId}/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to extract decisions');
  return data.decisions;
}

export async function fetchWeeklyDigest(
  days = 7,
  repoIds?: string[]
): Promise<{ digest: string; count: number; capped: number }> {
  const res = await fetch('/api/digest/weekly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days, repoIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate digest');
  return data;
}

// --- Vector / search index ---

export interface IndexStatus {
  path: string;
  version: number;
  embedder: string | null;
  dim: number | null;
  sessionCount: number;
  chunkCount: number;
  sessionChunks: number;
  turnChunks: number;
}

export async function fetchIndexStatus(): Promise<IndexStatus> {
  const res = await fetch('/api/index/status');
  return res.json();
}

export interface ReconcileReport {
  dryRun: boolean;
  embedder: string;
  dim: number;
  onDisk: number;
  inIndex: number;
  plan: { new: number; appended: number; rewritten: number; noop: number; deleted: number };
  embeddedChunks: number;
  deletedChunks: number;
  errors: string[];
  durationMs: number;
}

export async function reconcileIndex(dryRun = false): Promise<ReconcileReport> {
  const res = await fetch('/api/index/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Reconcile failed');
  return data;
}

export type SearchMode = 'hybrid' | 'vector' | 'bm25';

export interface SearchHit {
  id: string;
  sessionId: string;
  repoId: string;
  kind: 'session' | 'turn';
  turnIndex: number | null;
  score: number;
  snippet: string;
}

export async function searchIndex(
  query: string,
  opts: { k?: number; mode?: SearchMode; kind?: 'session' | 'turn' | null } = {}
): Promise<{ hits: SearchHit[]; mode: SearchMode; total: number }> {
  const res = await fetch('/api/index/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      k: opts.k ?? 15,
      mode: opts.mode ?? 'hybrid',
      kind: opts.kind ?? null,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  return data;
}

export interface Citation {
  n: number;
  sessionId: string;
  repoId: string;
  kind: 'session' | 'turn';
  snippet: string;
}

export async function askIndex(
  question: string,
  k = 8
): Promise<{ answer: string; citations: Citation[] }> {
  const res = await fetch('/api/index/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, k }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ask failed');
  return data;
}

export async function fetchClaudeSettings(): Promise<Record<string, unknown>> {
  const res = await fetch('/api/claude-settings');
  return res.json();
}

export async function updateClaudeSettings(
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch('/api/claude-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}
