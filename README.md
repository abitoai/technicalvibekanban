# Claude Session Browser

A local kanban board for organizing and resuming your Claude Code sessions across every repo.

## Quick Start

```bash
cd server && npm install
cd ../frontend && npm install
cp server/.env.example server/.env   # paste your Anthropic API key
cd .. && npm run dev
```

Open http://localhost:5173.

## Features

### Board
- Scans `~/.claude/projects/` and lists every repo that has at least one `.jsonl` session.
- Sessions open into a 6-column kanban: **Backlog → To do → In progress → Human review → Agent review → Done**.
- Drag and drop between columns. The column assignment is persisted immediately.

### Resume
Click **Resume** on a session. The app:
1. Copies `claude --dangerously-skip-permissions --resume <sessionId>` to your clipboard.
2. Opens VS Code at the session's repo directory.
3. Shows a bottom-right toast with the exact command that was copied.

Press `` Ctrl+` `` to open a terminal in VS Code, then paste. The `--dangerously-skip-permissions` flag can be toggled off in Settings.

### Rename
- **AI rename** — sends the full session transcript to Claude Haiku 4.5 and asks for a ≤5-word title. The result is saved as the session's display name.
- **Manual rename** — click the session title on any card to edit it inline. Enter saves, Escape cancels.

Both rename paths write to a `<sessionId>.meta.json` sidecar file — see *How state is stored* below.

### Settings
- **Session retention** — reads and writes `~/.claude/settings.json`'s `cleanupPeriodDays`. Set high or click Disable to keep sessions from being auto-pruned by Claude Code.
- **Resume command** — toggle whether `--dangerously-skip-permissions` is included in the copied command.
- **Hidden repositories** — substring patterns (localStorage); any repo dir whose id contains a pattern is hidden from the sidebar. Defaults: `worktrees`, `paperclip`.

## How state is stored

The app is **non-destructive** — it never modifies Claude Code's own session files. All edits go into a sidecar.

| File | Who writes it | What it contains |
| --- | --- | --- |
| `~/.claude/projects/<repoId>/<sessionId>.jsonl` | Claude Code | The raw conversation (read-only for this app). |
| `~/.claude/projects/<repoId>/<sessionId>.meta.json` | **This app** | `{ status, custom_name }` — column placement + renamed title. |
| `~/.claude/projects/<repoId>/sessions-index.json` | Claude Code | Precomputed metadata the app reads for titles, counts, branches. |
| `~/.claude/settings.json` | Claude Code | Shared settings; only `cleanupPeriodDays` is edited from here. |
| `localStorage` (browser) | This app | `excludePatterns`, `skipPermissions`. |

**Implication:** renames and column assignments are only visible in this app. If you run `claude --resume` or use Claude Code's own session picker, it won't see the custom name or the kanban status. That's intentional — integrating with those files risks being overwritten by Claude Code or corrupting them.

## Architecture

```
server/      Node + Express (port 3001)
  index.js   All routes; reads/writes sidecars; proxies Haiku for AI rename.
  .env       ANTHROPIC_API_KEY (gitignored).

frontend/    React + Vite + Tailwind (port 5173)
  src/
    App.tsx          Layout shell + toast state.
    api.ts           Fetch wrappers for every backend endpoint.
    types.ts         Repo / Session / COLUMN_CONFIG.
    components/      RepoSidebar, SessionBoard, SessionCard, SettingsModal.

designs/     Experimental skill-based redesigns (gitignored).
.claude/     Project-level Claude skills consumed by Claude Code.
```

Vite proxies `/api/*` to `http://localhost:3001` so the frontend and backend share an origin in dev.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/repos` | List repos with session counts, sorted by most recent activity. |
| `GET` | `/api/repos/:repoId/sessions` | List sessions for a repo, merging `.meta.json` + index data. |
| `PUT` | `/api/sessions/:sessionId/meta` | Body `{ status?, custom_name?, repoId }` — writes the sidecar. |
| `POST` | `/api/sessions/:sessionId/resume` | Body `{ repoId, skipPermissions }` — copies command + opens VS Code. |
| `POST` | `/api/sessions/:sessionId/summarize` | Body `{ sessionId, repoId }` — AI rename via Haiku 4.5. |
| `GET` \| `PUT` | `/api/claude-settings` | Read/merge into `~/.claude/settings.json`. |
