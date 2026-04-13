import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { exec, spawn } from 'child_process';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const app = express();
app.use(cors());
app.use(express.json());

const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
const PORT = process.env.PORT || 3001;

// Get the real repo path by reading cwd from the first user message in any session file.
// The directory name encoding is lossy (dashes, underscores, dots all become -),
// so we read the actual cwd from the session data instead.
async function getRepoPath(dirPath, dirName) {
  try {
    // Try sessions-index.json first
    const indexPath = join(dirPath, 'sessions-index.json');
    const indexData = JSON.parse(await readFile(indexPath, 'utf-8'));
    if (indexData.originalPath) return indexData.originalPath;
    if (indexData.entries?.[0]?.projectPath) return indexData.entries[0].projectPath;
  } catch { /* no index */ }

  // Fall back to reading cwd from first session file
  try {
    const files = await readdir(dirPath);
    const firstJsonl = files.find(f => f.endsWith('.jsonl'));
    if (firstJsonl) {
      const msgs = await readFirstMessages(join(dirPath, firstJsonl), 'user', 1);
      if (msgs[0]?.cwd) return msgs[0].cwd;
    }
  } catch { /* can't read */ }

  // Last resort: crude decode
  return dirName;
}

// Get friendly name from a repo path (last segment)
function repoName(repoPath) {
  const segments = repoPath.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] || repoPath;
}

// Read first N lines matching a type from a JSONL file
async function readFirstMessages(filePath, type, count = 1) {
  const messages = [];
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === type) {
          messages.push(obj);
          if (messages.length >= count) break;
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file not readable */ }
  return messages;
}

// Extract text content from a user message
function extractText(msg) {
  const content = msg?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text') return block.text;
    }
  }
  return '';
}

// Read every user/assistant text message in order as "User: ..." / "Assistant: ..." lines.
async function readTranscript(filePath) {
  const lines = [];
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'user' && obj.type !== 'assistant') continue;
        const text = extractText(obj);
        if (text) lines.push(`${obj.type === 'user' ? 'User' : 'Assistant'}: ${text}`);
      } catch { /* skip malformed */ }
    }
  } catch { /* unreadable */ }
  return lines;
}

// Call Anthropic's messages API. Returns the first text block's content or throws with a useful error.
async function callAnthropic({ model, maxTokens, prompt, system }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.content?.[0]?.text) {
    throw new Error(data.error?.message || `Anthropic returned ${response.status}`);
  }
  return data.content[0].text.trim();
}

// Merge new fields into a session's .meta.json sidecar.
async function updateMeta(repoId, sessionId, patch) {
  const metaPath = join(PROJECTS_DIR, repoId, `${sessionId}.meta.json`);
  let meta = {};
  try { meta = JSON.parse(await readFile(metaPath, 'utf-8')); } catch { /* new */ }
  Object.assign(meta, patch);
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

// --- ROUTES ---

// GET /api/repos — list all repos with sessions
app.get('/api/repos', async (req, res) => {
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    const repos = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = join(PROJECTS_DIR, entry.name);
      const files = await readdir(dirPath);
      // Only count .jsonl files (sessions with actual conversation history)
      const sessionFiles = files.filter(f => f.endsWith('.jsonl') && f !== 'sessions-index.json');

      if (sessionFiles.length === 0) continue;

      const repoPath = await getRepoPath(dirPath, entry.name);

      // Get most recent modification time across all session files
      let latestMtime = 0;
      for (const f of sessionFiles) {
        try {
          const s = await stat(join(dirPath, f));
          if (s.mtimeMs > latestMtime) latestMtime = s.mtimeMs;
        } catch { /* skip */ }
      }

      repos.push({
        id: entry.name,
        path: repoPath,
        name: repoName(repoPath),
        sessionCount: sessionFiles.length,
        lastActivity: new Date(latestMtime).toISOString(),
      });
    }

    // Sort by most recent activity
    repos.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/repos/:repoId/sessions — list sessions for a repo
app.get('/api/repos/:repoId/sessions', async (req, res) => {
  try {
    const dirPath = join(PROJECTS_DIR, req.params.repoId);
    const files = await readdir(dirPath);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl') && f !== 'sessions-index.json');

    // Try to read sessions-index.json for pre-computed metadata
    let indexEntries = {};
    try {
      const indexPath = join(dirPath, 'sessions-index.json');
      const indexData = JSON.parse(await readFile(indexPath, 'utf-8'));
      if (indexData.entries) {
        for (const entry of indexData.entries) {
          indexEntries[entry.sessionId] = entry;
        }
      }
    } catch { /* no index file, will parse manually */ }

    const sessions = [];

    for (const file of sessionFiles) {
      const sessionId = basename(file, '.jsonl');
      const filePath = join(dirPath, file);

      // Read .meta.json sidecar if exists
      let meta = { status: 'backlog' };
      try {
        const metaPath = join(dirPath, `${sessionId}.meta.json`);
        meta = { ...meta, ...JSON.parse(await readFile(metaPath, 'utf-8')) };
      } catch { /* no meta file yet */ }

      // Get session info from index or parse file
      const indexed = indexEntries[sessionId];
      if (indexed) {
        sessions.push({
          sessionId,
          firstPrompt: indexed.firstPrompt || '',
          summary: indexed.summary || null,
          customName: meta.custom_name || null,
          status: meta.status,
          messageCount: indexed.messageCount || 0,
          created: indexed.created || null,
          modified: indexed.modified || null,
          gitBranch: indexed.gitBranch || null,
          brief: meta.brief || null,
          decisions: meta.decisions || null,
        });
      } else {
        // Parse the file for basic info
        const fileStat = await stat(filePath);
        const userMessages = await readFirstMessages(filePath, 'user', 1);
        const firstPrompt = userMessages.length > 0 ? extractText(userMessages[0]) : '';
        const timestamp = userMessages[0]?.timestamp || fileStat.mtime.toISOString();

        sessions.push({
          sessionId,
          firstPrompt: firstPrompt.slice(0, 200),
          summary: null,
          customName: meta.custom_name || null,
          status: meta.status,
          messageCount: 0, // unknown without full parse
          created: timestamp,
          modified: fileStat.mtime.toISOString(),
          gitBranch: userMessages[0]?.gitBranch || null,
          brief: meta.brief || null,
          decisions: meta.decisions || null,
        });
      }
    }

    // Sort by created date, newest first
    sessions.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:sessionId/details — deep inspection of a session
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

app.get('/api/sessions/:sessionId/details', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { repoId } = req.query;
    if (!repoId) return res.status(400).json({ error: 'repoId is required' });

    const dirPath = join(PROJECTS_DIR, repoId);
    const filePath = join(dirPath, `${sessionId}.jsonl`);

    const toolCounts = {};
    const touchedFiles = new Map(); // file_path -> { reads, writes, edits }
    let firstTimestamp = null;
    let lastTimestamp = null;
    let messageCount = 0;
    let forkedFrom = null;
    let gitBranch = null;
    let cwd = null;

    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.forkedFrom && !forkedFrom) forkedFrom = obj.forkedFrom;
      if (obj.gitBranch && !gitBranch) gitBranch = obj.gitBranch;
      if (obj.cwd && !cwd) cwd = obj.cwd;
      if (obj.timestamp) {
        if (!firstTimestamp) firstTimestamp = obj.timestamp;
        lastTimestamp = obj.timestamp;
      }
      if (obj.type === 'user' || obj.type === 'assistant') messageCount++;

      if (obj.type !== 'assistant') continue;
      const content = obj.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block?.type !== 'tool_use') continue;
        const name = block.name || 'Unknown';
        toolCounts[name] = (toolCounts[name] || 0) + 1;

        if (FILE_TOOLS.has(name)) {
          const filePathInput = block.input?.file_path || block.input?.notebook_path;
          if (filePathInput) {
            const entry = touchedFiles.get(filePathInput) || { reads: 0, writes: 0, edits: 0 };
            if (name === 'Read') entry.reads++;
            else if (name === 'Write') entry.writes++;
            else entry.edits++;
            touchedFiles.set(filePathInput, entry);
          }
        }
      }
    }

    // Group files by directory
    const byDir = new Map();
    for (const [fp, counts] of touchedFiles) {
      const normalized = fp.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '.';
      const file = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push({ file, ...counts });
    }
    const fileGroups = [...byDir.entries()]
      .map(([dir, files]) => ({ dir, count: files.length, files: files.sort((a, b) => a.file.localeCompare(b.file)) }))
      .sort((a, b) => b.count - a.count);

    // Find children: any session in this repo whose first data line forkedFrom.sessionId === ours
    const children = [];
    try {
      const repoFiles = await readdir(dirPath);
      for (const f of repoFiles) {
        if (!f.endsWith('.jsonl') || f === `${sessionId}.jsonl`) continue;
        const childId = basename(f, '.jsonl');
        try {
          const childRl = createInterface({ input: createReadStream(join(dirPath, f)), crlfDelay: Infinity });
          let checked = 0;
          for await (const cline of childRl) {
            if (++checked > 3) break;
            try {
              const cobj = JSON.parse(cline);
              if (cobj.forkedFrom?.sessionId === sessionId) {
                children.push({ sessionId: childId, created: cobj.timestamp || null });
                break;
              }
            } catch { /* skip */ }
          }
        } catch { /* unreadable */ }
      }
    } catch { /* no dir */ }

    const durationSeconds = firstTimestamp && lastTimestamp
      ? Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 1000)
      : null;

    res.json({
      sessionId,
      gitBranch,
      cwd,
      firstMessage: firstTimestamp,
      lastMessage: lastTimestamp,
      durationSeconds,
      messageCount,
      toolCounts,
      touchedFileCount: touchedFiles.size,
      fileGroups,
      forkedFrom,
      children,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sessions/:sessionId/meta — update session metadata
app.put('/api/sessions/:sessionId/meta', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, custom_name, repoId } = req.body;

    if (!repoId) return res.status(400).json({ error: 'repoId is required' });

    const metaPath = join(PROJECTS_DIR, repoId, `${sessionId}.meta.json`);

    // Read existing meta
    let meta = {};
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    } catch { /* doesn't exist yet */ }

    // Merge updates
    if (status !== undefined) meta.status = status;
    if (custom_name !== undefined) meta.custom_name = custom_name;

    await writeFile(metaPath, JSON.stringify(meta, null, 2));
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:sessionId/resume — open repo in VS Code and copy claude --resume command to clipboard
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const cmd = platform === 'win32' ? 'clip'
      : platform === 'darwin' ? 'pbcopy'
      : 'xclip';
    const args = platform === 'linux' ? ['-selection', 'clipboard'] : [];
    const proc = spawn(cmd, args);
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

app.post('/api/sessions/:sessionId/resume', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { repoId, skipPermissions = true } = req.body;
    if (!repoId) return res.status(400).json({ error: 'repoId is required' });

    const dirPath = join(PROJECTS_DIR, repoId);
    const repoPath = await getRepoPath(dirPath, repoId);

    let repoPathExists = true;
    try {
      const s = await stat(repoPath);
      if (!s.isDirectory()) repoPathExists = false;
    } catch {
      repoPathExists = false;
    }

    const command = skipPermissions
      ? `claude --dangerously-skip-permissions --resume ${sessionId}`
      : `claude --resume ${sessionId}`;

    await copyToClipboard(command);

    if (repoPathExists) {
      exec(`code "${repoPath}"`);
    }

    res.json({ ok: true, command, repoPath, repoPathExists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:sessionId/summarize — generate AI summary
app.post('/api/sessions/:sessionId/summarize', async (req, res) => {
  try {
    const { sessionId, repoId, maxWords } = req.body;
    if (!repoId) return res.status(400).json({ error: 'repoId is required' });
    const wordLimit = Math.max(1, Math.min(20, Math.floor(Number(maxWords)) || 5));

    const filePath = join(PROJECTS_DIR, repoId, `${sessionId}.jsonl`);

    // Read the full conversation transcript (all user + assistant text content, in order)
    const transcriptLines = [];
    try {
      const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
      for await (const line of rl) {
        try {
          const obj = JSON.parse(line);
          if (obj.type !== 'user' && obj.type !== 'assistant') continue;
          const text = extractText(obj);
          if (text) transcriptLines.push(`${obj.type === 'user' ? 'User' : 'Assistant'}: ${text}`);
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file not readable */ }
    const transcript = transcriptLines.join('\n\n');

    // Call Claude API for summary
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set. Set it to enable summarization.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.max(30, wordLimit * 6),
        messages: [{
          role: 'user',
          content: `Below is a conversation transcript. Respond with ${wordLimit} or fewer words describing what was actually done in the chat. Not a complete sentence — just the things that were done, like a terse label. No punctuation, no quotes, no prefix.\n\n${transcript}`,
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.content?.[0]?.text) {
      console.error('Anthropic API error:', response.status, JSON.stringify(data));
      return res.status(502).json({
        error: data.error?.message || `Anthropic API returned ${response.status}`,
        details: data,
      });
    }
    const summary = data.content[0].text.trim();

    // Save to meta file
    const metaPath = join(PROJECTS_DIR, repoId, `${sessionId}.meta.json`);
    let meta = {};
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    } catch { /* new file */ }
    meta.custom_name = summary;
    await writeFile(metaPath, JSON.stringify(meta, null, 2));

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:sessionId/brief — short "where you left off" brief (Haiku, last turns)
app.post('/api/sessions/:sessionId/brief', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { repoId } = req.body;
    if (!repoId) return res.status(400).json({ error: 'repoId is required' });

    const filePath = join(PROJECTS_DIR, repoId, `${sessionId}.jsonl`);
    const allLines = await readTranscript(filePath);
    if (allLines.length === 0) return res.status(400).json({ error: 'Session has no content yet' });

    const tail = allLines.slice(-12).join('\n\n');
    const prompt = `Below are the last turns of a Claude Code session. Write exactly 2 sentences describing where the session left off. First sentence: what was being worked on (be concrete — name the file/feature/bug). Second sentence: the immediate next step, blocker, or open question. No pleasantries, no meta-commentary, no "the user" or "the assistant" — write as if briefing the person who was doing the work.\n\n${tail}`;

    const brief = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 200,
      prompt,
    });

    await updateMeta(repoId, sessionId, { brief, briefGeneratedAt: new Date().toISOString() });
    res.json({ brief });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/sessions/:sessionId/decisions — long-form decisions/learnings writeup (Sonnet, full transcript)
app.post('/api/sessions/:sessionId/decisions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { repoId } = req.body;
    if (!repoId) return res.status(400).json({ error: 'repoId is required' });

    const filePath = join(PROJECTS_DIR, repoId, `${sessionId}.jsonl`);
    const allLines = await readTranscript(filePath);
    if (allLines.length === 0) return res.status(400).json({ error: 'Session has no content yet' });

    const transcript = allLines.join('\n\n');
    const prompt = `Below is a full Claude Code session transcript. Write a markdown writeup suitable for pasting into a CLAUDE.md file. Use these exact H2 headings:\n\n## Objective\n## Work done\n## Decisions\n## Learnings\n## Open questions\n\nIn Decisions, state each decision and its rationale (why that path, what alternatives were considered, what constraint forced it). Be concrete — name files, functions, approaches. Avoid marketing language. Write for the user's future self picking this up cold. Aim for 250-450 words total. No preamble, start directly with the first heading.\n\nTranscript:\n\n${transcript}`;

    const decisions = await callAnthropic({
      model: 'claude-sonnet-4-6',
      maxTokens: 2000,
      prompt,
    });

    await updateMeta(repoId, sessionId, { decisions, decisionsGeneratedAt: new Date().toISOString() });
    res.json({ decisions });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/digest/weekly — journal-style digest across all repos for the last N days
app.post('/api/digest/weekly', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(60, Number(req.body?.days) || 7));
    const cutoff = Date.now() - days * 86_400_000;
    const repoFilter = Array.isArray(req.body?.repoIds) && req.body.repoIds.length > 0
      ? new Set(req.body.repoIds)
      : null;

    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    const perSession = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (repoFilter && !repoFilter.has(entry.name)) continue;
      const dirPath = join(PROJECTS_DIR, entry.name);
      let files = [];
      try { files = await readdir(dirPath); } catch { continue; }
      const repoPath = await getRepoPath(dirPath, entry.name);
      const repoDisplayName = repoName(repoPath);

      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const sessionId = basename(f, '.jsonl');
        const filePath = join(dirPath, f);
        let s;
        try { s = await stat(filePath); } catch { continue; }
        if (s.mtimeMs < cutoff) continue;

        // Meta
        let meta = {};
        try { meta = JSON.parse(await readFile(join(dirPath, `${sessionId}.meta.json`), 'utf-8')); } catch { /* none */ }

        // First user message + last assistant message for flavor
        const lines = await readTranscript(filePath);
        if (lines.length === 0) continue;
        const firstUser = lines.find(l => l.startsWith('User: ')) || '';
        const lastAssistant = [...lines].reverse().find(l => l.startsWith('Assistant: ')) || '';

        perSession.push({
          repo: repoDisplayName,
          title: meta.custom_name || firstUser.replace(/^User: /, '').slice(0, 100) || sessionId,
          status: meta.status || 'backlog',
          modified: new Date(s.mtimeMs).toISOString(),
          messageCount: lines.length,
          firstPrompt: firstUser.replace(/^User: /, '').slice(0, 400),
          lastLine: lastAssistant.replace(/^Assistant: /, '').slice(0, 400),
        });
      }
    }

    if (perSession.length === 0) {
      return res.json({ digest: `No sessions in the last ${days} day${days === 1 ? '' : 's'}.`, count: 0 });
    }

    perSession.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    // Cap the input — if thousands of sessions, trim to the most recent ~40 to keep tokens sane.
    const capped = perSession.slice(0, 40);

    const blocks = capped.map((s, i) => (
      `### ${i + 1}. ${s.title}\n- Repo: ${s.repo}\n- Status: ${s.status}\n- Messages: ${s.messageCount}\n- Last active: ${s.modified}\n- First ask: ${s.firstPrompt}\n- Last line: ${s.lastLine}`
    )).join('\n\n');

    const prompt = `Below are summaries of Claude Code sessions the user worked on in the last ${days} day${days === 1 ? '' : 's'}, across every repo. Write a first-person journal entry (180-320 words) in the user's voice. Structure: what got shipped (Done status), what's still in progress, what got stuck or abandoned (Backlog with recent activity suggests exploration that stalled), and any patterns you notice across repos. Name specific repos, features, and files. Be honest and concrete — no platitudes, no "exciting progress." If little happened, say so plainly.\n\n${blocks}`;

    const digest = await callAnthropic({
      model: 'claude-sonnet-4-6',
      maxTokens: 1500,
      prompt,
    });

    res.json({ digest, count: perSession.length, capped: capped.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

// GET /api/claude-settings — read Claude Code settings
app.get('/api/claude-settings', async (req, res) => {
  try {
    const data = JSON.parse(await readFile(CLAUDE_SETTINGS_PATH, 'utf-8'));
    res.json(data);
  } catch {
    res.json({});
  }
});

// PUT /api/claude-settings — update Claude Code settings
app.put('/api/claude-settings', async (req, res) => {
  try {
    let current = {};
    try {
      current = JSON.parse(await readFile(CLAUDE_SETTINGS_PATH, 'utf-8'));
    } catch { /* new file */ }

    const updated = { ...current, ...req.body };
    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Session browser server running on http://localhost:${PORT}`);
  console.log(`Scanning sessions from: ${PROJECTS_DIR}`);
});
