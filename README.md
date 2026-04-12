# Claude Session Browser

A local kanban board for organizing and resuming your Claude Code sessions across all repos.

## Quick Start

```bash
cd server && npm install
cd ../frontend && npm install
cd .. && npm run dev
```

Open http://localhost:5173

## Features

- Scans `~/.claude/projects/` for all Claude Code sessions
- Groups sessions by repo in a sidebar
- Kanban board with columns: Backlog, To do, In progress, Human Review, Agent Review, Done
- Drag-and-drop between columns (state saved as `.meta.json` sidecar files)
- Resume sessions in terminal with one click
- AI-powered session summarization
- Configure session retention to prevent auto-deletion
