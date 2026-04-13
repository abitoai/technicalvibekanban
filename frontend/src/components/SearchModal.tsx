import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  searchIndex,
  askIndex,
  type SearchHit,
  type SearchMode,
  type Citation,
} from '../api';

type Tab = 'search' | 'ask';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSession?: (repoId: string, sessionId: string) => void;
}

export default function SearchModal({ open, onClose, onOpenSession }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHits(null);
    setAnswer(null);
    setCitations([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHits(null);
    try {
      const { hits } = await searchIndex(query, { k: 15, mode });
      setHits(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const runAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    try {
      const data = await askIndex(query, 8);
      setAnswer(data.answer);
      setCitations(data.citations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'search') runSearch();
    else runAsk();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-espresso-900/40 backdrop-blur-2xl" />

      <div
        className="relative w-full max-w-[92vw] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bezel-shell shadow-soft-xl">
          <div className="bezel-core max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-8 pt-8 pb-5">
              <div>
                <span className="eyebrow">Studio · Memory</span>
                <h2 className="text-display mt-3 text-2xl text-espresso-900">
                  {tab === 'search' ? 'Search past sessions' : 'Ask your sessions'}
                </h2>
                <p className="mt-2 font-serif text-[13px] italic text-espresso-500">
                  {tab === 'search'
                    ? 'Hybrid BM25 + vector retrieval across every indexed session.'
                    : 'Claude Sonnet answers questions grounded in your past work.'}
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

            {/* Tabs + controls */}
            <div className="flex items-center justify-between gap-3 px-8 pt-5">
              <div className="inline-flex rounded-full border border-espresso-900/10 bg-cream-50 p-0.5">
                {(['search', 'ask'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={[
                      'rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors duration-500 ease-silk',
                      tab === t ? 'bg-espresso-900 text-cream' : 'text-espresso-500 hover:text-espresso-800',
                    ].join(' ')}
                  >
                    {t === 'search' ? 'Search' : 'Ask'}
                  </button>
                ))}
              </div>

              {tab === 'search' && (
                <div className="inline-flex rounded-full border border-espresso-900/10 bg-cream-50 p-0.5">
                  {(['hybrid', 'vector', 'bm25'] as SearchMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={[
                        'rounded-full px-3 py-1 font-mono text-[10.5px] tracking-wider transition-colors duration-500 ease-silk',
                        mode === m ? 'bg-ochre/30 text-espresso-900' : 'text-espresso-500 hover:text-espresso-800',
                      ].join(' ')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="px-8 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    tab === 'search'
                      ? 'find the session where… / error in auth.ts / websocket reconnection…'
                      : 'how did I handle X last time? / what\'s my usual approach to Y?'
                  }
                  className="field-input flex-1"
                />
                <button type="submit" disabled={loading || !query.trim()} className="island-btn">
                  <span className="pl-0.5">
                    {loading
                      ? tab === 'search' ? 'Searching…' : 'Synthesizing…'
                      : tab === 'search' ? 'Search' : 'Ask'}
                  </span>
                  <span className="nub">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12 L12 4" />
                      <path d="M6 4h6v6" />
                    </svg>
                  </span>
                </button>
              </div>
            </form>

            {/* Body — scrollable */}
            <div className="scrollbar-soft max-h-[60vh] overflow-y-auto px-8 pb-8">
              {error && (
                <div className="rounded-2xl border border-rose/30 bg-rose/5 px-4 py-3 text-[12px] text-rose">
                  {error}
                </div>
              )}

              {tab === 'search' && hits && (
                <>
                  <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-espresso-500">
                    {hits.length === 0 ? 'No hits — reconcile the index or try different terms' : `${hits.length} hit${hits.length === 1 ? '' : 's'}`}
                  </div>
                  <ul className="space-y-2">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          onClick={() => onOpenSession?.(h.repoId, h.sessionId)}
                          className="group/hit w-full rounded-2xl border border-espresso-900/5 bg-cream-50 px-4 py-3 text-left transition-all duration-500 ease-silk hover:border-espresso-900/20 hover:shadow-soft-sm active:scale-[0.995]"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={[
                                'rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider',
                                h.kind === 'session' ? 'bg-ochre/20 text-ochre' : 'bg-espresso-900/5 text-espresso-500',
                              ].join(' ')}>
                                {h.kind}{h.kind === 'turn' && h.turnIndex !== null ? ` #${h.turnIndex}` : ''}
                              </span>
                              <code className="font-mono text-[10.5px] text-espresso-500">
                                {h.sessionId.slice(0, 8)} · {h.repoId.slice(0, 32)}
                              </code>
                            </div>
                            <span className="font-mono text-[10px] text-espresso-400">
                              {h.score.toFixed(3)}
                            </span>
                          </div>
                          <p className="font-serif text-[13px] leading-snug text-espresso-800 line-clamp-3">
                            {h.snippet}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === 'ask' && answer && (
                <div className="space-y-5">
                  <div className="whitespace-pre-wrap rounded-2xl border border-espresso-900/10 bg-cream-50 px-5 py-4 font-serif text-[14px] leading-relaxed text-espresso-800">
                    {answer}
                  </div>

                  {citations.length > 0 && (
                    <div>
                      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-espresso-500">
                        Cited sessions
                      </div>
                      <ul className="space-y-1.5">
                        {citations.map((c) => (
                          <li key={c.n}>
                            <button
                              onClick={() => onOpenSession?.(c.repoId, c.sessionId)}
                              className="flex w-full items-start gap-3 rounded-2xl border border-espresso-900/5 bg-cream-50 px-4 py-2.5 text-left transition-all duration-500 ease-silk hover:border-espresso-900/20"
                            >
                              <span className="shrink-0 rounded-full bg-ochre/20 px-2 py-0.5 font-mono text-[10px] text-ochre">
                                [{c.n}]
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-[10.5px] text-espresso-500">
                                  {c.sessionId.slice(0, 8)} · {c.repoId.slice(0, 32)}
                                </div>
                                <p className="mt-0.5 line-clamp-2 font-serif text-[12px] text-espresso-700">
                                  {c.snippet}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
