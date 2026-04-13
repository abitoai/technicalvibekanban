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
