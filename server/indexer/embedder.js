// Local embedder using @huggingface/transformers (ONNX, runs on CPU/wasm).
// Default model: bge-small-en-v1.5 — 384d, ~35MB, fast on CPU.
import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { homedir } from 'os';

// Cache model weights under ~/.claude/vibekanban-models so they live with the rest of our state.
env.cacheDir = join(homedir(), '.claude', 'vibekanban-models');

export const EMBEDDER_ID = 'Xenova/bge-small-en-v1.5';
export const EMBED_DIM = 384;

let extractor = null;
let loading = null;

export async function getEmbedder() {
  if (extractor) return extractor;
  if (loading) return loading;
  console.log(`[embed] loading ${EMBEDDER_ID}…`);
  loading = pipeline('feature-extraction', EMBEDDER_ID, { dtype: 'q8' })
    .then((e) => {
      extractor = e;
      console.log('[embed] ready.');
      return e;
    });
  return loading;
}

export async function embed(text) {
  const ext = await getEmbedder();
  const out = await ext(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}
