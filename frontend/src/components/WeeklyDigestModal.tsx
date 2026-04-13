import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchWeeklyDigest } from '../api';
import type { Repo } from '../types';

interface Props {
  open: boolean;
  repos: Repo[];
  currentRepoId: string | null;
  onClose: () => void;
}

export default function WeeklyDigestModal({ open, repos, currentRepoId, onClose }: Props) {
  const [days, setDays] = useState(7);
  const [digest, setDigest] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // empty Set = "all repos"; otherwise a specific subset
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setDigest(null);
    setCount(null);
    setError(null);
    setCopied(false);
    // Default to all repos — empty set signals "all"
    setSelected(new Set());
  }, [open]);

  const allSelected = selected.size === 0;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.size === 0) {
        // switching from "all" → specific: start with everything except this one
        repos.forEach((r) => next.add(r.id));
        next.delete(id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // if user re-selected everything, collapse back to "all"
      if (next.size === repos.length) return new Set();
      return next;
    });
  };

  const selectAll = () => setSelected(new Set());
  const selectCurrent = () => {
    if (currentRepoId) setSelected(new Set([currentRepoId]));
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setDigest(null);
    try {
      const repoIds = allSelected ? undefined : [...selected];
      if (!allSelected && selected.size === 0) {
        setError('Select at least one repo.');
        return;
      }
      const data = await fetchWeeklyDigest(days, repoIds);
      setDigest(data.digest);
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* denied */ }
  };

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
            <div className="flex items-start justify-between px-8 pt-8 pb-5">
              <div className="min-w-0 flex-1 pr-4">
                <span className="eyebrow">Studio · Digest</span>
                <h2 className="text-display mt-3 text-2xl text-espresso-900">
                  Weekly journal
                </h2>
                <p className="mt-2 font-serif text-[13px] italic text-espresso-500">
                  A journal entry synthesized across every repo and session.
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

            <div className="space-y-5 px-8 pt-6 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-[13px] text-espresso-600">Last</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={days}
                    onChange={(e) => setDays(Math.max(1, Math.min(60, parseInt(e.target.value) || 7)))}
                    className="field-input w-20"
                  />
                  <span className="text-[13px] text-espresso-600">days</span>
                </label>

                <div className="ml-auto flex gap-2">
                  <button onClick={selectAll} className="ghost-btn" disabled={allSelected}>
                    All repos
                  </button>
                  {currentRepoId && (
                    <button
                      onClick={selectCurrent}
                      className="ghost-btn"
                      disabled={!allSelected && selected.size === 1 && selected.has(currentRepoId)}
                    >
                      Current only
                    </button>
                  )}
                </div>
              </div>

              {/* Repo chips */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-espresso-500">
                    Repositories
                  </span>
                  <span className="font-mono text-[10px] text-espresso-400">
                    {allSelected
                      ? `all · ${repos.length}`
                      : `${selected.size} of ${repos.length}`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {repos.map((r) => {
                    const on = allSelected || selected.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        className={[
                          'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-500 ease-silk',
                          on
                            ? 'border-ochre/40 bg-ochre-soft/40 text-espresso-900'
                            : 'border-espresso-900/10 bg-cream-50 text-espresso-500 hover:text-espresso-800',
                        ].join(' ')}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="island-btn"
                >
                  <span className="pl-0.5">
                    {loading ? 'Synthesizing…' : digest ? 'Regenerate' : 'Generate digest'}
                  </span>
                  <span className="nub">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2.5 L9.4 6.6 L13.5 8 L9.4 9.4 L8 13.5 L6.6 9.4 L2.5 8 L6.6 6.6 Z" />
                    </svg>
                  </span>
                </button>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose/30 bg-rose/5 px-4 py-3 text-[12px] text-rose">
                  {error}
                </div>
              )}

              {typeof count === 'number' && count === 0 && (
                <div className="rounded-2xl border border-dashed border-espresso-900/10 bg-cream-50 px-4 py-6 text-center font-serif text-[13px] italic text-espresso-500">
                  No sessions in that window.
                </div>
              )}

              {digest && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-espresso-500">
                      Across {count} session{count === 1 ? '' : 's'}
                    </span>
                    <button onClick={handleCopy} className="ghost-btn">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                        {copied ? (
                          <path d="M3.5 8.5 L6.5 11.5 L12.5 5" />
                        ) : (
                          <>
                            <rect x="4" y="4" width="9" height="10" rx="1.5" />
                            <path d="M6 4V2.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V12" />
                          </>
                        )}
                      </svg>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="whitespace-pre-wrap rounded-2xl border border-espresso-900/10 bg-cream-50 px-5 py-4 font-serif text-[14px] leading-relaxed text-espresso-800">
                    {digest}
                  </div>
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
