import { useState, useEffect } from 'react';
import { X, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { fetchClaudeSettings, updateClaudeSettings } from '../api';

const STORAGE_KEY = 'session-browser-settings';

export interface Settings {
  excludePatterns: string[];
  skipPermissions: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  excludePatterns: ['worktrees', 'paperclip'],
  skipPermissions: true,
};

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* use defaults */ }
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
          typeof data.cleanupPeriodDays === 'number'
            ? data.cleanupPeriodDays
            : 30
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Session Retention */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Session retention
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Claude Code auto-deletes conversation history after this many days.
              Set a high number to prevent losing sessions.
            </p>

            {cleanupDays !== null && !isProtected && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">
                  Sessions older than {cleanupDays} days are being auto-deleted.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={cleanupDays ?? ''}
                onChange={(e) => setCleanupDays(parseInt(e.target.value) || 0)}
                className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
              />
              <span className="text-sm text-gray-500">days</span>
              <button
                onClick={() => setCleanupDays(100000)}
                className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Disable
              </button>
              <button
                onClick={handleCleanupSave}
                disabled={cleanupLoading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 ml-auto"
              >
                {cleanupSaved ? (
                  <>
                    <Check className="w-3 h-3" /> Saved
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>

          {/* Resume Command */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Resume command
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              The Resume button copies the command to your clipboard. Include
              <code className="mx-1 px-1 py-0.5 bg-gray-800 rounded text-gray-400">--dangerously-skip-permissions</code>
              to bypass approval prompts when pasting.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.skipPermissions}
                onChange={toggleSkipPermissions}
                className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300">
                Include <code className="text-gray-400">--dangerously-skip-permissions</code>
              </span>
            </label>
          </div>

          {/* Exclude Patterns */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Exclude directories containing
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Repos whose directory name contains any of these patterns will be
              hidden from the sidebar.
            </p>

            <div className="space-y-2 mb-3">
              {settings.excludePatterns.map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
                >
                  <code className="text-sm text-gray-300">{pattern}</code>
                  <button
                    onClick={() => removePattern(pattern)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPattern()}
                placeholder="e.g. node_modules"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={addPattern}
                disabled={!newPattern.trim()}
                className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
