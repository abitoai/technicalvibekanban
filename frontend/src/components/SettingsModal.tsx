import { useState, useEffect } from 'react';
import { fetchClaudeSettings, updateClaudeSettings } from '../api';

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

  useEffect(() => {
    if (open) {
      setSettings(loadSettings());
      setCleanupSaved(false);
      fetchClaudeSettings().then((data) => {
        setCleanupDays(
          typeof data.cleanupPeriodDays === 'number' ? data.cleanupPeriodDays : 30
        );
      });
    }
  }, [open]);

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

              {/* AI rename length */}
              <section>
                <SectionHeader
                  kicker="03 · Distillation"
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
                  kicker="04 · Visibility"
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
