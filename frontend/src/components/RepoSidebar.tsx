import { Settings } from 'lucide-react';
import type { Repo } from '../types';

interface Props {
  repos: Repo[];
  selectedRepoId: string | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  loading: boolean;
}

export default function RepoSidebar({ repos, selectedRepoId, onSelect, onOpenSettings, loading }: Props) {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Session Browser</h1>
          <p className="text-xs text-gray-500 mt-1">Claude Code Sessions</p>
        </div>
        <button
          onClick={onOpenSettings}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-gray-500 text-sm p-3">Loading repos...</div>
        ) : repos.length === 0 ? (
          <div className="text-gray-500 text-sm p-3">No repos found</div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelect(repo.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center gap-3 transition-colors ${
                selectedRepoId === repo.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{repo.name}</div>
                <div className="text-xs text-gray-500 truncate">{repo.path}</div>
              </div>
              <span className="text-xs text-gray-500 shrink-0">
                {repo.sessionCount}
              </span>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
