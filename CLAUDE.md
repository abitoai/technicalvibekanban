# CLAUDE.md

Guidance for Claude Code instances working in this repo.

## What this project is

A local kanban board for browsing, organizing, and resuming Claude Code sessions across every repo the user has used `claude` in. Scans `~/.claude/projects/`, renders a sidebar of repos and a 6-column board per repo.

Stack: Node/Express backend (`server/`, port 3001) + React/Vite/Tailwind frontend (`frontend/`, port 5173). No database — all state lives in the filesystem or localStorage.

## The non-obvious architectural decision

**The app never writes to Claude Code's own files.** Column placement and renames are stored in a per-session sidecar `<sessionId>.meta.json` that this app created. Claude Code neither reads nor writes that file.

| File | Owner | This app |
| --- | --- | --- |
| `<sessionId>.jsonl` | Claude Code | **read only** |
| `<sessionId>.meta.json` | This app | read + write |
| `sessions-index.json` | Claude Code | **read only** |
| `~/.claude/settings.json` | Claude Code | read + merge (only `cleanupPeriodDays` is surfaced) |

Consequence: renames and kanban statuses are visible only in this app. `claude --resume` and the native Claude Code session picker don't see them. If a future task asks to "make rename visible in Claude Code," the user should be warned that Claude Code may overwrite edits to `sessions-index.json` or corrupt the `.jsonl`.

## Features and where they live

- **Repo list** — `GET /api/repos` enumerates `~/.claude/projects/` dirs containing ≥1 `.jsonl`. Each repo's real filesystem path is recovered via `getRepoPath()` in `server/index.js` (reads `originalPath` from `sessions-index.json`, falls back to the first user message's `cwd`, last resort: the dir name itself — which is lossy because Claude encodes slashes/dots/underscores all as `-`).
- **Board** — 6 columns defined in `frontend/src/types.ts` `COLUMNS`. Drag-drop uses `@hello-pangea/dnd`. On drop, `updateSessionMeta` writes the new status to the sidecar.
- **Resume** — `POST /api/sessions/:sessionId/resume` does **not** spawn a terminal and does **not** write any task files. It:
  1. Builds `claude --dangerously-skip-permissions --resume <id>` (flag gated by `skipPermissions`).
  2. Copies that string to the OS clipboard (`clip` on Windows, `pbcopy` on macOS, `xclip` on Linux).
  3. Runs `code "<repoPath>"` to open VS Code at the session's repo.
  4. Returns `{ command, repoPath, repoPathExists }`.
  The frontend shows the copied command in a bottom-right toast. User presses `` Ctrl+` `` and pastes. **Do not resurrect** the earlier `tasks.json` approach — the user explicitly rejected it.
- **AI rename** — `POST /api/sessions/:sessionId/summarize` reads every user + assistant text message from the session's `.jsonl`, concatenates them, sends to `claude-haiku-4-5-20251001` with a prompt asking for ≤5 words (max_tokens 30), and writes the result to `custom_name` in the sidecar. Anthropic API errors propagate with the real message (frontend toasts it).
- **Manual rename** — clicking the title on `SessionCard` enters inline edit. Enter/blur saves via `updateSessionMeta` with `custom_name`. Same sidecar as AI rename.
- **Settings** — `SettingsModal` handles three concerns: retention (`cleanupPeriodDays` in `~/.claude/settings.json`), resume command flag (localStorage), hidden-repo substring patterns (localStorage).

## Running

```bash
npm run dev           # from root — runs both backend and frontend via concurrently
cd server && node index.js    # backend only
cd frontend && npm run dev    # frontend only (port 5173, proxies /api → 3001)
```

Backend loads `server/.env` via `dotenv`. `ANTHROPIC_API_KEY` is required for AI rename to function. Restart the backend after editing `.env`.

## Data shapes (don't break these)

`Session` (`frontend/src/types.ts`) — `{ sessionId, firstPrompt, summary, customName, status, messageCount, created, modified, gitBranch }`. The backend returns this exact shape from `/api/repos/:repoId/sessions`.

`Repo` — `{ id, path, name, sessionCount }`. `id` is the raw directory name under `~/.claude/projects/` (slashes/dots/underscores encoded as `-`); `path` is the recovered real filesystem path; `name` is the last segment of `path`.

`COLUMN_CONFIG` — extended by the current "soft" design with `dot` (hex color) and `accent` (subtitle) fields. If you refactor components, preserve those additive fields or update every consumer.

## Design experiments (`designs/`)

`designs/` is gitignored (`.gitignore` has `designs/*`). It contains seven skill-based redesign variants produced in parallel by sub-agents. The chosen design (**soft**) was copied into `frontend/` and the mock `api.ts` was replaced with the real one. Treat `designs/` as scratch — don't rely on anything there being consistent with `frontend/`.

## Gotchas

- **Directory-name encoding is lossy.** Always resolve real paths via `getRepoPath()`, never trust the raw dir name.
- **Dev script.** The root `npm run dev` uses `concurrently` and does not auto-reload the backend. After editing `server/index.js`, kill and restart (or switch to `node --watch index.js` if needed).
- **`.vscode/tasks.json` residue.** Earlier iterations wrote task files to user repos. If a user reports VS Code auto-running `claude --resume` on folder open, it's a stale file from the old behavior — search for `"Vibekanban: Resume Claude Session"` and delete the task or the whole file.
- **Windows clipboard.** `clip` is invoked via `spawn`; don't switch to `exec` with a piped echo — it trips quoting edge cases.
