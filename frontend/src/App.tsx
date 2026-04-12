import { useState, useEffect, useMemo } from 'react';
import { fetchRepos } from './api';
import type { Repo } from './types';
import RepoSidebar from './components/RepoSidebar';
import SessionBoard from './components/SessionBoard';
import SettingsModal, { loadSettings, type Settings } from './components/SettingsModal';

export default function App() {
  const [allRepos, setAllRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 4000);
  };

  useEffect(() => {
    fetchRepos()
      .then(setAllRepos)
      .finally(() => setLoading(false));
  }, []);

  const repos = useMemo(() => {
    return allRepos.filter((repo) =>
      !settings.excludePatterns.some((pattern) =>
        repo.id.toLowerCase().includes(pattern.toLowerCase())
      )
    );
  }, [allRepos, settings.excludePatterns]);

  // Auto-select first visible repo
  useEffect(() => {
    if (repos.length > 0 && (!selectedRepoId || !repos.find(r => r.id === selectedRepoId))) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos]);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  return (
    <div className="flex h-screen">
      <RepoSidebar
        repos={repos}
        selectedRepoId={selectedRepoId}
        onSelect={setSelectedRepoId}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
      />
      <main className="flex-1 overflow-hidden">
        {selectedRepo ? (
          <SessionBoard
            repo={selectedRepo}
            skipPermissions={settings.skipPermissions}
            onResumed={showToast}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            {loading ? 'Loading repos...' : 'Select a repo to view sessions'}
          </div>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={setSettings}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md bg-gray-800 border border-gray-700 rounded-lg shadow-xl px-4 py-3">
          <p className="text-xs font-mono text-gray-200 break-all">{toast}</p>
        </div>
      )}
    </div>
  );
}
