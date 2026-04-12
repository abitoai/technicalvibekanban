export interface Repo {
  id: string;
  path: string;
  name: string;
  sessionCount: number;
}

export interface Session {
  sessionId: string;
  firstPrompt: string;
  summary: string | null;
  customName: string | null;
  status: string;
  messageCount: number;
  created: string | null;
  modified: string | null;
  gitBranch: string | null;
}

export const COLUMNS = ['backlog', 'todo', 'in_progress', 'human_review', 'agent_review', 'done'] as const;
export type ColumnStatus = (typeof COLUMNS)[number];

export const COLUMN_CONFIG: Record<ColumnStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'bg-gray-500' },
  todo: { label: 'To do', color: 'bg-blue-500' },
  in_progress: { label: 'In progress', color: 'bg-amber-500' },
  human_review: { label: 'Human Review', color: 'bg-purple-500' },
  agent_review: { label: 'Agent Review', color: 'bg-indigo-500' },
  done: { label: 'Done', color: 'bg-green-500' },
};
