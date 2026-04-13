import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchSessionDetails, type SessionDetails } from '../api';
import type { Session } from '../types';

interface Props {
  open: boolean;
  session: Session;
  repoId: string;
  onClose: () => void;
}

export default function SessionDetailsModal({ open, session, repoId, onClose }: Props) {
  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDetails(null);
    setError(null);
    setLoading(true);
    fetchSessionDetails(session.sessionId, repoId)
      .then((d) => setDetails(d))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [open, session.sessionId, repoId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const displayName =
    session.customName ||
    session.summary ||
    session.firstPrompt ||
    'Untitled session';

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-espresso-900/40 backdrop-blur-2xl" />

      <div
        className="relative w-full max-w-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bezel-shell shadow-soft-xl">
          <div className="bezel-core max-h-[85vh] overflow-y-auto scrollbar-soft">
            {/* Header */}
            <div className="flex items-start justify-between px-8 pt-8 pb-5">
              <div className="min-w-0 flex-1 pr-4">
                <span className="eyebrow">Session · Inspection</span>
                <h2 className="text-display mt-3 text-2xl text-espresso-900 line-clamp-2">
                  {displayName}
                </h2>
                <p className="mt-2 font-mono text-[11px] text-espresso-500 break-all">
                  {session.sessionId}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-espresso-900/10 bg-cream-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-500 ease-silk hover:shadow-soft-sm active:scale-95"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4 text-espresso-600" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <path d="M4 4 L12 12 M12 4 L4 12" />
                </svg>
              </button>
            </div>

            <div className="mx-8 h-px bg-gradient-to-r from-transparent via-espresso-900/10 to-transparent" />

            <div className="space-y-7 px-8 pt-6 pb-8">
              {loading && (
                <div className="py-10 text-center font-serif text-[13px] italic text-espresso-500">
                  Inspecting session…
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-rose/30 bg-rose/5 px-4 py-3 text-[12px] text-rose">
                  {error}
                </div>
              )}

              {details && !loading && (
                <>
                  {/* Summary tiles */}
                  <section>
                    <SectionHeader kicker="01 · Overview" title="At a glance" />
                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                      <Tile label="Messages" value={details.messageCount.toString()} />
                      <Tile label="Files touched" value={details.touchedFileCount.toString()} />
                      <Tile label="Duration" value={formatDuration(details.durationSeconds)} />
                      <Tile label="Branch" value={details.gitBranch || '—'} mono />
                    </div>
                  </section>

                  {/* Tools */}
                  {Object.keys(details.toolCounts).length > 0 && (
                    <section>
                      <SectionHeader kicker="02 · Tools" title="What Claude used" />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {Object.entries(details.toolCounts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([tool, count]) => (
                            <span
                              key={tool}
                              className="inline-flex items-center gap-2 rounded-full border border-espresso-900/10 bg-cream-50 px-3 py-1.5"
                            >
                              <span className="font-serif text-[12px] text-espresso-800">{tool}</span>
                              <span className="font-mono text-[10px] tabular-nums text-espresso-500">{count}</span>
                            </span>
                          ))}
                      </div>
                    </section>
                  )}

                  {/* File groups */}
                  {details.fileGroups.length > 0 && (
                    <section>
                      <SectionHeader
                        kicker="03 · Files"
                        title={`Touched ${details.touchedFileCount} files in ${details.fileGroups.length} ${details.fileGroups.length === 1 ? 'directory' : 'directories'}`}
                      />
                      <div className="mt-4 space-y-3">
                        {details.fileGroups.map((group) => (
                          <details
                            key={group.dir}
                            className="group rounded-2xl border border-espresso-900/5 bg-cream-50 open:bg-cream-100"
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
                              <code className="min-w-0 truncate font-mono text-[12px] text-espresso-700">
                                {group.dir}
                              </code>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="rounded-full bg-espresso-900/5 px-2 py-0.5 font-mono text-[10px] tabular-nums text-espresso-600">
                                  {group.count}
                                </span>
                                <svg viewBox="0 0 16 16" className="h-3 w-3 text-espresso-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M6 4l4 4-4 4" />
                                </svg>
                              </span>
                            </summary>
                            <ul className="space-y-1 border-t border-espresso-900/5 px-4 py-2.5">
                              {group.files.map((f) => (
                                <li
                                  key={f.file}
                                  className="flex items-center justify-between gap-3 py-0.5"
                                >
                                  <code className="min-w-0 truncate font-mono text-[11px] text-espresso-700">{f.file}</code>
                                  <span className="flex shrink-0 gap-1.5 font-mono text-[9.5px] text-espresso-500">
                                    {f.reads > 0 && <span>R·{f.reads}</span>}
                                    {f.edits > 0 && <span className="text-ochre">E·{f.edits}</span>}
                                    {f.writes > 0 && <span className="text-sage-deep">W·{f.writes}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Lineage */}
                  {(details.forkedFrom || details.children.length > 0) && (
                    <section>
                      <SectionHeader kicker="04 · Lineage" title="Session chain" />
                      <div className="mt-4 space-y-2">
                        {details.forkedFrom && (
                          <LineageRow
                            label="Forked from"
                            id={details.forkedFrom.sessionId}
                          />
                        )}
                        {details.children.map((child) => (
                          <LineageRow
                            key={child.sessionId}
                            label="Resumed as"
                            id={child.sessionId}
                            timestamp={child.created}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <span className="eyebrow">{kicker}</span>
      <h3 className="text-display mt-2 text-[18px] text-espresso-900">{title}</h3>
    </div>
  );
}

function Tile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-espresso-900/5 bg-cream-50 px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-espresso-500">{label}</div>
      <div className={`mt-1 truncate text-espresso-900 ${mono ? 'font-mono text-[12px]' : 'font-serif text-[15px] font-medium'}`}>
        {value}
      </div>
    </div>
  );
}

function LineageRow({ label, id, timestamp }: { label: string; id: string; timestamp?: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-espresso-900/5 bg-cream-50 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-wider text-espresso-500">{label}</div>
        <code className="block truncate font-mono text-[11px] text-espresso-700">{id}</code>
      </div>
      {timestamp && (
        <span className="ml-3 shrink-0 font-mono text-[10px] text-espresso-400">
          {new Date(timestamp).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}
