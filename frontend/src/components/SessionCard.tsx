import { useState } from 'react';
import { Terminal, Sparkles, GripVertical, GitBranch, MessageSquare, Clock } from 'lucide-react';
import { resumeSession, summarizeSession } from '../api';
import type { Session } from '../types';

interface Props {
  session: Session;
  repoId: string;
  skipPermissions: boolean;
  onResumed: (message: string) => void;
  onUpdate: () => void;
}

export default function SessionCard({ session, repoId, skipPermissions, onResumed, onUpdate }: Props) {
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
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors group">
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-gray-600 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 line-clamp-2">
            {displayName}
          </p>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {timeAgo && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </span>
            )}
            {session.messageCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {session.messageCount}
              </span>
            )}
            {session.gitBranch && (
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {session.gitBranch}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleResume}
              disabled={resuming}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              <Terminal className="w-3 h-3" />
              {resuming ? 'Opening...' : 'Resume'}
            </button>
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              {summarizing ? 'Summarizing...' : 'Summarize'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-gray-600 font-mono truncate">
        {session.sessionId}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
