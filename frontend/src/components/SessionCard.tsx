import { useState } from 'react';
import { resumeSession, summarizeSession } from '../api';
import type { Session } from '../types';

interface Props {
  session: Session;
  repoId: string;
  skipPermissions: boolean;
  onResumed: (message: string) => void;
  onUpdate: () => void;
}

export default function SessionCard({
  session,
  repoId,
  skipPermissions,
  onResumed,
  onUpdate,
}: Props) {
  const [summarizing, setSummarizing] = useState(false);
  const [resuming, setResuming] = useState(false);

  const displayName =
    session.customName ||
    session.summary ||
    session.firstPrompt ||
    'Untitled session';

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setResuming(true);
    try {
      const { command } = await resumeSession(session.sessionId, repoId, skipPermissions);
      onResumed(`${command} — copied`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume';
      onResumed(msg);
    } finally {
      setResuming(false);
    }
  };

  const handleSummarize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSummarizing(true);
    try {
      await summarizeSession(session.sessionId, repoId);
      onUpdate();
    } catch (err) {
      console.error('Failed to summarize:', err);
    } finally {
      setSummarizing(false);
    }
  };

  const timeAgo = session.created
    ? formatTimeAgo(new Date(session.created))
    : '';

  return (
    <article className="group/card relative">
      <div className="bezel-shell !p-[4px] transition-transform duration-500 ease-silk group-hover/card:-translate-y-[2px]">
        <div className="bezel-core relative overflow-hidden p-4">
          {/* Accent stripe (subtle) */}
          <span
            className="pointer-events-none absolute left-0 top-4 bottom-4 w-[2px] rounded-full bg-gradient-to-b from-ochre/60 via-rose/40 to-transparent opacity-0 transition-opacity duration-500 ease-silk group-hover/card:opacity-100"
            aria-hidden
          />

          {/* Title */}
          <p className="pr-2 font-serif text-[15px] font-medium leading-snug tracking-tight text-espresso-900 line-clamp-3">
            {displayName}
          </p>

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-espresso-500">
            {timeAgo && (
              <MetaChip icon={<ClockIcon />} text={timeAgo} />
            )}
            {session.messageCount > 0 && (
              <MetaChip
                icon={<MessageIcon />}
                text={`${session.messageCount} msgs`}
              />
            )}
            {session.gitBranch && (
              <MetaChip icon={<BranchIcon />} text={session.gitBranch} mono />
            )}
          </div>

          {/* CTA tray — reveals on hover */}
          <div
            className={[
              'mt-4 flex items-center gap-2',
              'max-h-0 overflow-hidden opacity-0',
              'transition-all duration-500 ease-silk',
              'group-hover/card:max-h-24 group-hover/card:opacity-100',
            ].join(' ')}
          >
            <button
              onClick={handleResume}
              disabled={resuming}
              className="island-btn group/btn"
            >
              <span className="pl-0.5">
                {resuming ? 'Opening…' : 'Resume'}
              </span>
              <span className="nub">
                {/* ultra-light arrow */}
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12 L12 4" />
                  <path d="M6 4h6v6" />
                </svg>
              </span>
            </button>

            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="ghost-btn"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2.5 L9.4 6.6 L13.5 8 L9.4 9.4 L8 13.5 L6.6 9.4 L2.5 8 L6.6 6.6 Z" />
              </svg>
              {summarizing ? 'Distilling…' : 'Summarize'}
            </button>
          </div>

          {/* Session id — footer */}
          <div className="mt-3 flex items-center justify-between border-t border-espresso-900/5 pt-2.5">
            <span className="truncate font-mono text-[9.5px] uppercase tracking-wider text-espresso-400">
              {session.sessionId}
            </span>
            <StatusDot status={session.status} />
          </div>
        </div>
      </div>
    </article>
  );
}

function MetaChip({
  icon,
  text,
  mono = false,
}: {
  icon: React.ReactNode;
  text: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-espresso-900/[0.04] px-2 py-0.5 ring-1 ring-espresso-900/[0.06]">
      <span className="text-espresso-500">{icon}</span>
      <span
        className={[
          'text-[10.5px] text-espresso-600',
          mono ? 'font-mono' : '',
        ].join(' ')}
      >
        {text}
      </span>
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    backlog: '#C2AE9A',
    todo: '#8A9A7B',
    in_progress: '#B88746',
    human_review: '#B06A5B',
    agent_review: '#7A604C',
    done: '#5E6E52',
  };
  return (
    <span
      className="h-1.5 w-1.5 rounded-full"
      style={{ background: map[status] ?? '#9E8673' }}
    />
  );
}

// ---------- Ultra-light line icons (no Lucide) ----------
function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.2L10 9.5" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4" cy="4" r="1.4" />
      <circle cx="4" cy="12" r="1.4" />
      <circle cx="12" cy="5" r="1.4" />
      <path d="M4 5.4v5.2" />
      <path d="M4 8c0-2 2-3 4-3h2.6" />
    </svg>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hrs = Math.floor(minutes / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
