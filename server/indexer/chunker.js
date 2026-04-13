// Reads a Claude Code .jsonl session and produces:
//   - one session-level chunk (title/summary/brief/first-prompt blob)
//   - many turn-level chunks (each user message + immediate assistant response)
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { createInterface } from 'readline';
import { createHash } from 'crypto';

function extractText(obj) {
  const content = obj?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (block?.type === 'text' && block.text) parts.push(block.text);
    }
    return parts.join('\n');
  }
  return '';
}

const TURN_CHAR_CAP = 8000;

export async function chunkSession(filePath, metaInfo = {}) {
  const turns = [];
  let pendingUser = null;
  let firstPrompt = '';
  let lineCount = 0;
  let nextTurnIndex = 0;

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    lineCount++;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'user') {
      const text = extractText(obj);
      if (!text) continue;
      pendingUser = { text };
      if (!firstPrompt) firstPrompt = text;
    } else if (obj.type === 'assistant' && pendingUser) {
      const aText = extractText(obj);
      const combined = `User: ${pendingUser.text}\n\nAssistant: ${aText || '(tool calls only)'}`;
      turns.push({ turnIndex: nextTurnIndex++, text: combined.slice(0, TURN_CHAR_CAP) });
      pendingUser = null;
    }
  }

  if (pendingUser) {
    turns.push({
      turnIndex: nextTurnIndex++,
      text: `User: ${pendingUser.text}`.slice(0, TURN_CHAR_CAP),
    });
  }

  const sessionTextParts = [];
  if (metaInfo.customName) sessionTextParts.push(`Title: ${metaInfo.customName}`);
  if (metaInfo.summary) sessionTextParts.push(`Summary: ${metaInfo.summary}`);
  if (metaInfo.brief) sessionTextParts.push(`Brief: ${metaInfo.brief}`);
  if (firstPrompt) sessionTextParts.push(`First prompt: ${firstPrompt.slice(0, 1500)}`);
  const sessionText = sessionTextParts.join('\n');

  return { lineCount, sessionText, turns };
}

export async function countLines(filePath) {
  let n = 0;
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const _ of rl) n++;
  return n;
}

// SHA-256 of the first 8KB — used as a cheap "did this file get rewritten?" check.
export async function headHash(filePath) {
  const fd = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, 8192, 0);
    return createHash('sha256').update(buf.subarray(0, bytesRead)).digest('hex');
  } finally {
    await fd.close();
  }
}
