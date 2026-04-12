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

// Editorial-luxury column palette — tuned for the cream/espresso base
export const COLUMN_CONFIG: Record<
  ColumnStatus,
  { label: string; color: string; dot: string; accent: string }
> = {
  backlog:      { label: 'Backlog',       color: 'bg-espresso-300', dot: '#C2AE9A', accent: 'Drafts at rest' },
  todo:         { label: 'To do',         color: 'bg-sage-soft',    dot: '#8A9A7B', accent: 'Ready to pick up' },
  in_progress:  { label: 'In progress',   color: 'bg-ochre',        dot: '#B88746', accent: 'Active composition' },
  human_review: { label: 'Human review',  color: 'bg-rose',         dot: '#B06A5B', accent: 'Awaiting your eye' },
  agent_review: { label: 'Agent review',  color: 'bg-espresso-500', dot: '#7A604C', accent: 'Self-critique loop' },
  done:         { label: 'Done',          color: 'bg-sage-deep',    dot: '#5E6E52', accent: 'Shipped & at rest' },
};
