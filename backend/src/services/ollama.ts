import axios from 'axios';
import { historyPrompt, sanitizeRelease } from './gemini.js';
import type { ExtractedRelease } from '../lib/types.js';

/**
 * Local history extraction through Ollama, for bulk seeding on a developer
 * machine without spending the Gemini quota. Same prompt, same sanitising, so the
 * documents it produces are indistinguishable from the cloud path's.
 */

export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

/** Local models need a smaller window than the 100k chars the cloud path sends. */
const MAX_INPUT_CHARS = 20_000;

/** Accepts a bare array, `{releases: []}`, or the first array-valued property. */
export function parseReleaseList(text: string): Partial<ExtractedRelease>[] {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Partial<ExtractedRelease>[];
  if (parsed && typeof parsed === 'object') {
    const first = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
    if (first) return first as Partial<ExtractedRelease>[];
  }
  return [];
}

export async function extractHistoryLocal(
  softwareName: string,
  rawData: string,
  options: { model: string; numCtx?: number } = { model: 'qwen3:14b' },
): Promise<ExtractedRelease[]> {
  // Ollama's JSON mode wants an object at the top level, so ask for one.
  const prompt = historyPrompt(softwareName, rawData.slice(0, MAX_INPUT_CHARS)).replace(
    'Return ONLY a JSON array of objects:',
    'Return ONLY a JSON object of the form {"releases": [...]} where each item is:',
  );

  const res = await axios.post<{ message?: { content?: string } }>(
    `${OLLAMA_URL}/api/chat`,
    {
      model: options.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0, num_ctx: options.numCtx ?? 12_288, num_predict: 6_000 },
    },
    { timeout: 900_000 },
  );

  return parseReleaseList(res.data.message?.content ?? '[]')
    .map(sanitizeRelease)
    .filter((r) => r.version.length > 0);
}
