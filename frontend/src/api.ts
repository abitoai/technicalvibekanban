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
