import { useState, useEffect } from 'react';
import {
  fetchClaudeSettings,
  updateClaudeSettings,
  fetchIndexStatus,
  reconcileIndex,
  type IndexStatus,
  type ReconcileReport,
} from '../api';

const STORAGE_KEY = 'session-browser-settings';

export interface Settings {
  excludePatterns: string[];
  skipPermissions: boolean;
  renameWordCount: number;
}

const DEFAULT_SETTINGS: Settings = {
  excludePatterns: ['worktrees', 'paperclip'],
  skipPermissions: true,
  renameWordCount: 5,
};

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSettingsChange: (settings: Settings) => void;
}

export default function SettingsModal({ open, onClose, onSettingsChange }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [newPattern, setNewPattern] = useState('');
  const [cleanupDays, setCleanupDays] = useState<number | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupSaved, setCleanupSaved] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<ReconcileReport | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSettings(loadSettings());
      setCleanupSaved(false);
      setReconcileReport(null);
      setReconcileError(null);
      fetchClaudeSettings().then((data) => {
        setCleanupDays(
          typeof data.cleanupPeriodDays === 'number' ? data.cleanupPeriodDays : 30
        );
      });
      fetchIndexStatus().then(setIndexStatus).catch(() => setIndexStatus(null));
    }
  }, [open]);

  const handleReconcile = async (dryRun: boolean) => {
    setReconciling(true);
    setReconcileError(null);
    setReconcileReport(null);
    try {
      const report = await reconcileIndex(dryRun);
      setReconcileReport(report);
      if (!dryRun) {
        const status = await fetchIndexStatus();
        setIndexStatus(status);
      }
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  if (!open) return null;

  const addPattern = () => {
    const pattern = newPattern.trim();
    if (!pattern || settings.excludePatterns.includes(pattern)) return;
    const updated = {
      ...settings,
      excludePatterns: [...settings.excludePatterns, pattern],
    };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange(updated);
    setNewPattern('');
  };

  const removePattern = (pattern: string) => {
    const updated = {
      ...settings,
      excludePatterns: settings.excludePatterns.filter((p) => p !== pattern),
    };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange(updated);
  };

  const toggleSkipPermissions = () => {
    const updated = { ...settings, skipPermissions: !settings.skipPermissions };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange(updated);
  };

  const setRenameWordCount = (value: number) => {
    const clamped = Math.max(1, Math.min(20, Math.floor(value) || 1));
    const updated = { ...settings, renameWordCount: clamped };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange(updated);
  };

  const handleCleanupSave = async () => {
    if (cleanupDays === null) return;
    setCleanupLoading(true);
    try {
      await updateClaudeSettings({ cleanupPeriodDays: cleanupDays });
      setCleanupSaved(true);
      setTimeout(() => setCleanupSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update Claude settings:', err);
    } finally {
      setCleanupLoading(false);
    }
  };

  const isProtected = cleanupDays !== null && cleanupDays > 365;

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center px-4"
      onClick={onClose}
    >
      {/* Glass overlay */}
      <div className="absolute inset-0 bg-espresso-900/40 backdrop-blur-2xl" />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bezel-shell shadow-soft-xl">
          <div className="bezel-core max-h-[85vh] overflow-y-auto scrollbar-soft">
            {/* Header */}
            <div className="flex items-start justify-between px-8 pt-8 pb-6">
              <div>
                <span className="eyebrow">Preferences</span>
                <h2 className="text-display mt-3 text-3xl text-espresso-900">
                  Studio settings
                </h2>
                <p className="mt-1.5 font-serif text-[13px] italic text-espresso-500">
                  Tune how the atelier greets your sessions.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close settings"
                className="grid h-10 w-10 place-items-center rounded-full border border-espresso-900/10 bg-cream-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-500 ease-silk hover:shadow-soft-sm active:scale-95"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 text-espresso-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                >
                  <path d="M4 4 L12 12 M12 4 L4 12" />
                </svg>
              </button>
            </div>

            <div className="mx-8 h-px bg-gradient-to-r from-transparent via-espresso-900/10 to-transparent" />

            <div className="stagger space-y-8 px-8 pt-7 pb-8">
              {/* Session retention */}
              <section>
                <SectionHeader
                  kicker="01 · Retention"
                  title="Session memory"
                  subtitle="Claude Code auto-deletes conversation history after this many days. Set a high value to archive work for the long haul."
                />

                {cleanupDays !== null && !isProtected && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ochre/25 bg-ochre-soft/20 px-4 py-3">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ochre" />
                    <p className="text-[12px] text-espresso-700">
                      Sessions older than{' '}
                      <span className="font-medium">{cleanupDays} days</span> are
                      being auto-deleted.
                    </p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    value={cleanupDays ?? ''}
                    onChange={(e) =>
                      setCleanupDays(parseInt(e.target.value) || 0)
                    }
                    className="field-input w-28"
                  />
                  <span className="text-[13px] text-espresso-500">days</span>
                  <button
                    onClick={() => setCleanupDays(100000)}
                    className="ghost-btn"
                  >
                    Disable
                  </button>
                  <button
                    onClick={handleCleanupSave}
                    disabled={cleanupLoading}
                    className="island-btn ml-auto"
                  >
                    <span className="pl-0.5">
                      {cleanupSaved ? 'Saved' : cleanupLoading ? 'Saving…' : 'Save'}
                    </span>
                    <span className="nub">
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {cleanupSaved ? (
                          <path d="M3.5 8.5 L6.5 11.5 L12.5 5" />
                        ) : (
                          <path d="M4 8h8 M8 4l4 4-4 4" />
                        )}
                      </svg>
                    </span>
                  </button>
                </div>
              </section>

              {/* Resume command */}
              <section>
                <SectionHeader
                  kicker="02 · Invocation"
                  title="Resume command"
                  subtitle="The Resume button copies a shell command to your clipboard. Include the skip-permissions flag to bypass prompts when pasting."
                />

                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-espresso-900/5 bg-cream-100 px-4 py-3 transition-colors duration-500 ease-silk hover:bg-cream-200/70">
                  <ToggleSwitch
                    on={settings.skipPermissions}
                    onChange={toggleSkipPermissions}
                  />
                  <span className="text-[13px] text-espresso-700">
                    Include{' '}
                    <code className="rounded-md bg-espresso-900/5 px-1.5 py-0.5 font-mono text-[11px] text-espresso-800">
                      --dangerously-skip-permissions
                    </code>
                  </span>
                </label>
              </section>

              {/* Semantic index */}
              <section>
                <SectionHeader
                  kicker="03 · Memory"
                  title="Semantic index"
                  subtitle="Local vector + BM25 index of every session. Used by Search and Ask. First reconcile downloads a ~35 MB embedding model; subsequent runs are incremental."
                />

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <IndexTile label="Sessions" value={indexStatus?.sessionCount ?? '—'} />
                  <IndexTile label="Chunks" value={indexStatus?.chunkCount ?? '—'} />
                  <IndexTile label="Dim" value={indexStatus?.dim ?? '—'} />
                  <IndexTile label="Model" value={(indexStatus?.embedder || '—').split('/').pop() || '—'} mono />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleReconcile(true)}
                    disabled={reconciling}
                    className="ghost-btn"
                  >
                    {reconciling ? 'Checking…' : 'Dry run'}
                  </button>
                  <button
                    onClick={() => handleReconcile(false)}
                    disabled={reconciling}
                    className="island-btn"
                  >
                    <span className="pl-0.5">
                      {reconciling ? 'Reconciling…' : 'Reconcile index'}
                    </span>
                    <span className="nub">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8a5 5 0 0 1 9-3 M13 8a5 5 0 0 1-9 3" />
                        <path d="M12 2v3h-3 M4 14v-3h3" />
                      </svg>
                    </span>
                  </button>
                </div>

                {reconcileError && (
                  <div className="mt-3 rounded-2xl border border-rose/30 bg-rose/5 px-4 py-3 text-[12px] text-rose">
                    {reconcileError}
                  </div>
                )}

                {reconcileReport && (
                  <div className="mt-3 rounded-2xl border border-espresso-900/10 bg-cream-50 px-4 py-3 text-[12px] text-espresso-700">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-espresso-500">
                      {reconcileReport.dryRun ? 'Dry run' : 'Reconciled'} · {(reconcileReport.durationMs / 1000).toFixed(1)}s
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px]">
                      <span>new: {reconcileReport.plan.new}</span>
                      <span>appended: {reconcileReport.plan.appended}</span>
                      <span>rewritten: {reconcileReport.plan.rewritten}</span>
                      <span>noop: {reconcileReport.plan.noop}</span>
                      <span>deleted: {reconcileReport.plan.deleted}</span>
                      <span className="text-ochre">embedded: {reconcileReport.embeddedChunks}</span>
                      {reconcileReport.errors.length > 0 && (
                        <span className="text-rose">errors: {reconcileReport.errors.length}</span>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* AI rename length */}
              <section>
                <SectionHeader
                  kicker="04 · Distillation"
                  title="AI rename length"
                  subtitle="The max number of words Haiku returns when you click AI rename. Existing names aren't touched — this only affects future renames."
                />

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.renameWordCount}
                    onChange={(e) => setRenameWordCount(parseInt(e.target.value) || 1)}
                    className="field-input w-24"
                  />
                  <span className="text-[13px] text-espresso-500">words max</span>
                </div>
              </section>

              {/* Exclude patterns */}
              <section>
                <SectionHeader
                  kicker="05 · Visibility"
                  title="Hidden repositories"
                  subtitle="Repos whose directory name contains any of these patterns will be tucked away from the sidebar."
                />

                <ul className="mt-4 space-y-2">
                  {settings.excludePatterns.length === 0 && (
                    <li className="rounded-2xl border border-dashed border-espresso-900/10 bg-cream-50 px-4 py-3 text-center font-serif text-[12px] italic text-espresso-500">
                      No patterns hidden.
                    </li>
                  )}
                  {settings.excludePatterns.map((pattern) => (
                    <li
                      key={pattern}
                      className="flex items-center justify-between rounded-2xl border border-espresso-900/5 bg-cream-50 px-4 py-2.5"
                    >
                      <code className="font-mono text-[12px] text-espresso-700">
                        {pattern}
                      </code>
                      <button
                        onClick={() => removePattern(pattern)}
                        aria-label={`Remove ${pattern}`}
                        className="grid h-8 w-8 place-items-center rounded-full text-espresso-400 transition-all duration-500 ease-silk hover:bg-rose/10 hover:text-rose"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        >
                          <path d="M4 4 L12 12 M12 4 L4 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPattern()}
                    placeholder="e.g. node_modules"
                    className="field-input flex-1 min-w-[180px]"
                  />
                  <button
                    onClick={addPattern}
                    disabled={!newPattern.trim()}
                    className="island-btn"
                  >
                    <span className="pl-0.5">Add pattern</span>
                    <span className="nub">
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      >
                        <path d="M8 3v10 M3 8h10" />
                      </svg>
                    </span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndexTile({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-espresso-900/5 bg-cream-50 px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-espresso-500">{label}</div>
      <div className={`mt-1 truncate text-espresso-900 ${mono ? 'font-mono text-[11px]' : 'font-serif text-[15px] font-medium'}`}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <span className="eyebrow">{kicker}</span>
      <h3 className="mt-2.5 font-serif text-[20px] font-medium tracking-tight text-espresso-900">
        {title}
      </h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-espresso-500">
        {subtitle}
      </p>
    </div>
  );
}

function ToggleSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.preventDefault();
        onChange();
      }}
      className={[
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-500 ease-silk',
        'shadow-[inset_0_1px_2px_rgba(42,30,23,0.15)]',
        on ? 'bg-espresso-800' : 'bg-espresso-900/15',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-cream shadow-soft-sm',
          'transition-transform duration-500 ease-spring',
          on ? 'translate-x-[22px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}
