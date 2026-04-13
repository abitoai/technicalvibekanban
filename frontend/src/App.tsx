import { useState, useEffect, useMemo } from 'react';
import { fetchRepos } from './api';
import type { Repo } from './types';
import RepoSidebar from './components/RepoSidebar';
import SessionBoard from './components/SessionBoard';
import SettingsModal, { loadSettings, type Settings } from './components/SettingsModal';
import WeeklyDigestModal from './components/WeeklyDigestModal';

export default function App() {
  const [allRepos, setAllRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
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

  useEffect(() => {
    if (repos.length > 0 && (!selectedRepoId || !repos.find((r) => r.id === selectedRepoId))) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  return (
    <div className="relative h-screen w-screen overflow-hidden font-sans text-espresso">
      {/* Ambient orb field — fixed, GPU-only transforms */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="orb animate-orb-drift"
          style={{
            top: '-180px',
            left: '-140px',
            width: '520px',
            height: '520px',
            background: 'radial-gradient(circle at 30% 30%, #D9B788 0%, rgba(217,183,136,0) 65%)',
            animationDelay: '0s',
          }}
        />
        <div
          className="orb animate-orb-drift"
          style={{
            bottom: '-220px',
            right: '-160px',
            width: '640px',
            height: '640px',
            background: 'radial-gradient(circle at 40% 40%, #C8D1BA 0%, rgba(200,209,186,0) 60%)',
            animationDelay: '-7s',
            opacity: 0.45,
          }}
        />
        <div
          className="orb animate-orb-drift"
          style={{
            top: '30%',
            right: '22%',
            width: '380px',
            height: '380px',
            background: 'radial-gradient(circle at 50% 50%, #D9B0A6 0%, rgba(217,176,166,0) 60%)',
            animationDelay: '-13s',
            opacity: 0.35,
          }}
        />
      </div>

      <div className="relative z-10 flex h-full">
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
              renameWordCount={settings.renameWordCount}
              onResumed={showToast}
              onOpenDigest={() => setDigestOpen(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="bezel-shell max-w-md animate-fade-up">
                <div className="bezel-core px-10 py-14 text-center">
                  <span className="eyebrow">Atelier</span>
                  <h2 className="text-display mt-6 text-3xl text-espresso-900">
                    {loading ? 'Gathering your studio…' : 'Choose a repository'}
                  </h2>
                  <p className="mt-4 text-sm text-espresso-500">
                    {loading
                      ? 'Mock data is being prepared.'
                      : 'Select a repo from the left pane to open its session board.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={setSettings}
      />

      <WeeklyDigestModal
        open={digestOpen}
        repos={repos}
        currentRepoId={selectedRepoId}
        onClose={() => setDigestOpen(false)}
      />

      {/* Toast — floating island */}
      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-scale-in">
          <div className="bezel-shell pointer-events-auto max-w-xl shadow-soft-xl">
            <div className="bezel-core flex items-center gap-4 px-5 py-3">
              <span className="inline-block h-2 w-2 rounded-full bg-sage-deep shadow-[0_0_0_4px_rgba(138,154,123,0.18)]" />
              <p className="break-all font-mono text-xs text-espresso-700">{toast}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
