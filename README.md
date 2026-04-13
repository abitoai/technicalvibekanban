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

### Session details (expand modal)
Click the expand icon on any card. The modal shows:
- Overview tiles (messages, files touched, duration, git branch)
- Tools Claude used with counts
- Files grouped by directory with per-file read/edit/write counts
- **Resumer brief** — a 2-sentence "where you left off" brief (Haiku, last 12 turns). Once generated, also appears on the card as an italic quote under the title.
- **Key decisions & learnings** — long-form markdown writeup (Sonnet, full transcript) with Objective / Work done / Decisions / Learnings / Open questions. One-click copy to paste into CLAUDE.md.
- Lineage chain (`forkedFrom` parent + any children spawned by `claude --resume`).

### Weekly digest
Journal icon in the board header opens a cross-repo digest modal: pick a day window (1–60) and any subset of repos, Sonnet synthesizes a first-person journal entry summarizing what got shipped / stuck / abandoned.

### Semantic search & Ask (cross-session memory)
A local, fully-offline search layer over every session.

- **Search** (magnifying glass in the sidebar header) — hybrid BM25 + vector retrieval across every indexed session. Toggle between `hybrid`, `vector`, and `bm25` modes. Click any hit to jump to its repo.
- **Ask** — same modal, "Ask" tab. Claude Sonnet 4.6 answers a question grounded in retrieved chunks, returns a markdown answer with clickable `[N]` citations. Ask always uses hybrid retrieval internally.

**Reconcile index** — manual sync from disk into the index, triggered from the "Semantic index" section of Settings. Run **Dry run** to see the plan, then **Reconcile**. First real run downloads the embedding model (~35 MB, cached under `~/.claude/vibekanban-models/`). Subsequent runs are incremental — only new/changed sessions re-embed. Set `AUTO_RECONCILE=true` in `server/.env` to run on server startup.

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
| `~/.claude/vibekanban-index.json` | **This app** | Local vector + BM25 index (chunk text + embeddings) used by Search / Ask. |
| `~/.claude/vibekanban-models/` | **This app** | Cached embedding model weights (~35 MB, `bge-small-en-v1.5`). |
| `localStorage` (browser) | This app | `excludePatterns`, `skipPermissions`, `renameWordCount`. |

**Implication:** renames and column assignments are only visible in this app. If you run `claude --resume` or use Claude Code's own session picker, it won't see the custom name or the kanban status. That's intentional — integrating with those files risks being overwritten by Claude Code or corrupting them.

## Architecture

```
server/         Node + Express (port 3001)
  index.js      All routes; reads/writes sidecars; proxies Haiku/Sonnet.
  .env          ANTHROPIC_API_KEY, AUTO_RECONCILE (gitignored).
  indexer/      Local search/index layer — no external services.
    embedder.js   @huggingface/transformers wrapper (bge-small-en-v1.5)
    chunker.js   .jsonl → session-level + turn-level chunks
    store.js     Flat-JSON vector store at ~/.claude/vibekanban-index.json
    bm25.js      Hand-rolled BM25, built in-memory from chunks
    search.js    Hybrid retrieval (BM25 + cosine fused with RRF)
    reconcile.js On-disk ⇄ index diff (new / appended / rewritten / deleted)

frontend/       React + Vite + Tailwind (port 5173)
  src/
    App.tsx          Layout shell, toast, modal routing.
    api.ts           Fetch wrappers for every backend endpoint.
    types.ts         Repo / Session / COLUMN_CONFIG.
    components/      RepoSidebar, SessionBoard, SessionCard, SettingsModal,
                     SessionDetailsModal, WeeklyDigestModal, SearchModal.

designs/        Experimental skill-based redesigns (gitignored).
.claude/        Project-level Claude skills consumed by Claude Code.
```

Vite proxies `/api/*` to `http://localhost:3001` so the frontend and backend share an origin in dev.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/repos` | List repos with session counts, sorted by most recent activity. |
| `GET` | `/api/repos/:repoId/sessions` | List sessions for a repo, merging `.meta.json` + index data. |
| `PUT` | `/api/sessions/:sessionId/meta` | Body `{ status?, custom_name?, repoId }` — writes the sidecar. |
| `POST` | `/api/sessions/:sessionId/resume` | Body `{ repoId, skipPermissions }` — copies command + opens VS Code. |
| `POST` | `/api/sessions/:sessionId/summarize` | Body `{ sessionId, repoId, maxWords }` — AI rename via Haiku 4.5. |
| `POST` | `/api/sessions/:sessionId/brief` | Body `{ repoId }` — 2-sentence resume brief (Haiku, last turns). |
| `POST` | `/api/sessions/:sessionId/decisions` | Body `{ repoId }` — long-form decisions markdown (Sonnet, full transcript). |
| `GET` | `/api/sessions/:sessionId/details` | Query `?repoId=…` — tool counts, touched files, lineage, duration. |
| `POST` | `/api/digest/weekly` | Body `{ days, repoIds? }` — cross-repo journal digest (Sonnet). |
| `GET` | `/api/index/status` | Index metadata (session count, chunk count, embedder). |
| `POST` | `/api/index/reconcile` | Body `{ dryRun? }` — sync index with disk, embed deltas. |
| `POST` | `/api/index/search` | Body `{ query, k?, mode?, kind? }` — hybrid / vector / bm25 search. |
| `POST` | `/api/index/ask` | Body `{ question, k? }` — retrieval-augmented Sonnet answer + citations. |
| `GET` \| `PUT` | `/api/claude-settings` | Read/merge into `~/.claude/settings.json`. |

## Semantic index — how it works

The Search / Ask features use a local, fully-offline hybrid index over every `.jsonl` session.

- **Embedder** — `Xenova/bge-small-en-v1.5` (384d, ~35 MB) via `@huggingface/transformers`. Runs on CPU/wasm. Model is downloaded once on first reconcile into `~/.claude/vibekanban-models/`.
- **Chunking** — each session becomes one session-level chunk (custom name + summary + brief + first prompt) plus one chunk per user-turn + immediate assistant response (capped at 8 KB).
- **Vector store** — a single flat JSON file at `~/.claude/vibekanban-index.json` holding `{ sessions, chunks }` where each chunk carries its 384-d vector inline. Brute-force cosine over this is fast at our scale (tens of thousands of chunks).
- **BM25** — a hand-rolled inverted index (`server/indexer/bm25.js`), built in-memory from chunk text at query time. Tokenizer preserves identifiers (file paths, error strings, branch names) intact.
- **Hybrid retrieval** — runs BM25 and vector cosine independently, fuses the two ranked lists with **Reciprocal Rank Fusion** (`score = Σ 1/(60 + rank)`). No tuning weights, outperforms linear combinations.
- **Reconciliation** — compares each on-disk `.jsonl`'s line count + SHA-256 of its first 8 KB to the index's recorded state. Planned actions: `new` (full embed), `appended` (embed only new turns), `rewritten` (head hash changed, full re-embed), `noop`, `deleted` (tombstone chunks). Idempotent.
- **Privacy** — nothing leaves your machine for Search. Ask sends the retrieved chunks (not the raw `.jsonl`) to Anthropic so Sonnet can synthesize the answer; the content of your sessions never hits a third-party embedding provider.
