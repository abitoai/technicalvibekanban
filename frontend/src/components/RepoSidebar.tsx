import type { Repo } from '../types';

interface Props {
  repos: Repo[];
  selectedRepoId: string | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  loading: boolean;
}

/**
 * Editorial sidebar — floating glass panel, Fraunces serif wordmark,
 * double-bezel row treatment on the active repo.
 */
export default function RepoSidebar({
  repos,
  selectedRepoId,
  onSelect,
  onOpenSettings,
  onOpenSearch,
  loading,
}: Props) {
  return (
    <aside className="relative flex w-[320px] shrink-0 flex-col p-5">
      {/* Outer bezel shell wraps the entire sidebar */}
      <div className="bezel-shell flex h-full flex-col">
        <div className="bezel-core flex h-full flex-col overflow-hidden">
          {/* Brand header */}
          <header className="relative px-7 pt-8 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-display text-[2rem] text-espresso-900">
                  Atelier
                </h1>
                <p className="mt-1 font-serif text-[13px] italic text-espresso-500">
                  a kanban for Claude sessions
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onOpenSearch}
                  title="Search & ask across all sessions"
                  aria-label="Open search"
                  className="grid h-10 w-10 place-items-center rounded-full border border-espresso-900/10 bg-cream-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-500 ease-silk hover:border-espresso-900/20 hover:shadow-soft-sm active:scale-95"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-espresso-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                </button>

                <button
                  onClick={onOpenSettings}
                  title="Studio preferences"
                  aria-label="Open settings"
                  className="group/set relative grid h-10 w-10 place-items-center rounded-full border border-espresso-900/10 bg-cream-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-500 ease-silk hover:border-espresso-900/20 hover:shadow-soft-sm active:scale-95"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-espresso-600 transition-transform duration-700 ease-silk group-hover/set:rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2.5v2.2M12 19.3v2.2M4.5 4.5l1.55 1.55M17.95 17.95l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.5 19.5l1.55-1.55M17.95 6.05l1.55-1.55" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          {/* Hairline separator */}
          <div className="mx-7 h-px bg-gradient-to-r from-transparent via-espresso-900/10 to-transparent" />

          {/* Section label */}
          <div className="px-7 pt-6 pb-3">
            <span className="eyebrow">Repositories · {repos.length}</span>
          </div>

          {/* Repo list */}
          <nav className="scrollbar-soft flex-1 overflow-y-auto px-4 pb-6">
            {loading ? (
              <LoadingRows />
            ) : repos.length === 0 ? (
              <div className="mx-3 rounded-2xl border border-dashed border-espresso-900/10 bg-cream-50 px-4 py-6 text-center">
                <p className="font-serif text-sm italic text-espresso-500">
                  No repositories yet.
                </p>
              </div>
            ) : (
              <ul className="stagger space-y-1.5">
                {repos.map((repo) => {
                  const active = selectedRepoId === repo.id;
                  return (
                    <li key={repo.id}>
                      <button
                        onClick={() => onSelect(repo.id)}
                        className={[
                          'group/row relative flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left',
                          'transition-all duration-500 ease-silk',
                          active
                            ? 'bg-gradient-to-br from-cream-50 to-cream-200 shadow-soft-md ring-1 ring-espresso-900/10'
                            : 'hover:bg-cream-50/70',
                        ].join(' ')}
                      >
                        {/* Active accent rail */}
                        <span
                          className={[
                            'absolute left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full',
                            'bg-gradient-to-b from-ochre to-rose',
                            'transition-all duration-500 ease-silk',
                            active ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-40',
                          ].join(' ')}
                        />

                        <div className="min-w-0 flex-1">
                          <div
                            className={[
                              'truncate text-[14px] font-medium tracking-tight',
                              active ? 'text-espresso-900' : 'text-espresso-800',
                            ].join(' ')}
                          >
                            {repo.name}
                          </div>
                          <div className="truncate font-mono text-[11px] text-espresso-500">
                            {repo.path}
                          </div>
                        </div>

                        <span
                          className={[
                            'shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] tabular-nums',
                            'transition-colors duration-500 ease-silk',
                            active
                              ? 'bg-ochre/15 text-ochre'
                              : 'bg-espresso-900/5 text-espresso-500',
                          ].join(' ')}
                        >
                          {repo.sessionCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Footer signature */}
          <footer className="border-t border-espresso-900/5 bg-cream-100/50 px-7 py-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-[11px] italic text-espresso-500">
                Crafted in-house
              </span>
              <span className="font-mono text-[10px] text-espresso-400">
                v.01 · mock
              </span>
            </div>
          </footer>
        </div>
      </div>
    </aside>
  );
}

function LoadingRows() {
  return (
    <ul className="space-y-2 px-1">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-[66px] animate-fade-in rounded-2xl bg-gradient-to-r from-cream-200 via-cream-100 to-cream-200 bg-[length:200%_100%] animate-shimmer"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </ul>
  );
}
