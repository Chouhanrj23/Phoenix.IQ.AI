// Model client. Google Gemini by default (free tier, long context, reads
// images, JSON mode); any OpenAI-compatible endpoint (Groq, OpenRouter,
// Cerebras, Mistral, a local server) via LLM_PROVIDER=openai-compatible.
//
// Keys are sent in request headers only, never in URLs, and never logged.

export interface ImagePart {
  mimeType: string;
  base64: string;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  images?: ImagePart[];
}

export interface LlmClient {
  provider: string;
  model: string;
  /** Whether screenshots can be attached. */
  supportsImages: boolean;
  /** Evidence-pack budget (characters) that fits the model's context window with room for the reply. */
  evidenceBudgetChars: number;
  generateJson(req: LlmRequest): Promise<unknown>;
}

export class QuotaExhaustedError extends Error {}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Retry/progress messages; run.ts routes them into the run's status log so the app shows them.
let logLine: (msg: string) => void = (msg) => console.log(msg);
export function setLlmLogger(fn: (msg: string) => void): void {
  logLine = fn;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class BadJsonError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.raw = raw;
  }
}

/** Every complete top-level JSON object/array in `text`, in order (string-aware brace matching). */
function topLevelJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if ((ch === '}' || ch === ']') && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          values.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // not a valid value; skip it
        }
        start = -1;
      }
    }
  }
  return values;
}

/**
 * Pulls the JSON out of a model reply. Tolerates ```json fences, stray prose,
 * and models that split one answer into several consecutive objects (their
 * array fields are concatenated, other fields kept from the first object).
 */
export function parseJsonReply(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // fall through to the general recovery below
      }
    }
    const values = topLevelJsonValues(trimmed);
    const objects = values.filter(
      (v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v),
    );
    if (objects.length) {
      const merged: Record<string, unknown> = {};
      for (const obj of objects) {
        for (const [k, v] of Object.entries(obj)) {
          const prev = merged[k];
          merged[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : (prev ?? v);
        }
      }
      return merged;
    }
    if (values.length) return values[0];
    throw new BadJsonError(`Model reply is not JSON: ${trimmed.slice(0, 200)}`, text);
  }
}

// ---------------------------------------------------------------- Gemini

async function pickGeminiModel(key: string): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok)
    throw new Error(
      `Gemini rejected the API key (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  const body = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const candidates = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    // Stable "flash" models: best free-tier capability per request.
    .filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
  const version = (n: string): number => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  candidates.sort((a, b) => version(b) - version(a));
  return candidates[0] ?? 'gemini-2.5-flash';
}

function geminiClient(key: string, model: string): LlmClient {
  return {
    provider: 'google-gemini',
    model,
    supportsImages: true,
    evidenceBudgetChars: 420_000,
    async generateJson({ system, prompt, images = [] }) {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...images.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.base64 },
              })),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 65_536,
          // Streamed thought summaries keep the connection busy while the model
          // reasons, so a long think is not mistaken for a dead connection.
          thinkingConfig: { includeThoughts: true },
        },
      };
      for (let attempt = 1; ; attempt++) {
        let res: Response;
        try {
          // Streamed (SSE): a non-streamed reply that takes over 300s to start
          // trips Node's fetch header timeout on large stages.
          res = await fetch(`${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body),
          });
        } catch (err) {
          if (attempt >= 4) throw err;
          logLine(`    network error (${(err as Error).message}); retrying in ${10 * attempt}s...`);
          await sleep(10_000 * attempt);
          continue;
        }
        if (!res.ok) {
          const raw = await res.text();
          if (res.status === 429 || res.status === 503 || res.status === 500) {
            if (/PerDay|per day|daily/i.test(raw) && res.status === 429) {
              throw new QuotaExhaustedError(
                `Gemini daily free-tier quota for ${model} is used up. Completed stages are cached; re-run tomorrow, or set GEMINI_MODEL to another model (e.g. a flash-lite one) to continue now.`,
              );
            }
            if (attempt >= 5)
              throw new Error(
                `Gemini still unavailable after ${attempt} attempts (HTTP ${res.status}).`,
              );
            const hinted = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(raw)?.[1];
            const waitS = Math.min(90, hinted ? Number(hinted) + 2 : 15 * attempt);
            logLine(`    rate-limited (HTTP ${res.status}); waiting ${Math.round(waitS)}s...`);
            await sleep(waitS * 1000);
            continue;
          }
          throw new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 500)}`);
        }
        let text = '';
        let thoughtChars = 0;
        let finishReason = 'none';
        let blockReason = 'none';
        let lastReport = Date.now();
        try {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith('data:')) continue;
              const chunk = JSON.parse(line.slice(5)) as {
                candidates?: {
                  content?: { parts?: { text?: string; thought?: boolean }[] };
                  finishReason?: string;
                }[];
                promptFeedback?: { blockReason?: string };
              };
              const cand = chunk.candidates?.[0];
              for (const p of cand?.content?.parts ?? []) {
                if (typeof p.text !== 'string') continue;
                if (p.thought) thoughtChars += p.text.length;
                else text += p.text;
              }
              finishReason = cand?.finishReason ?? finishReason;
              blockReason = chunk.promptFeedback?.blockReason ?? blockReason;
            }
            if (Date.now() - lastReport > 30_000) {
              lastReport = Date.now();
              logLine(
                `    ...${text.length ? `receiving (${Math.round(text.length / 1000)}k chars)` : `thinking (${Math.round(thoughtChars / 1000)}k chars of reasoning)`}`,
              );
            }
          }
        } catch (err) {
          if (attempt >= 4) throw err;
          logLine(`    stream interrupted (${(err as Error).message}); retrying...`);
          await sleep(10_000 * attempt);
          continue;
        }
        if (!text)
          throw new Error(
            `Gemini returned no text (finishReason=${finishReason}, block=${blockReason}).`,
          );
        if (finishReason === 'MAX_TOKENS')
          throw new Error('Gemini reply was cut off at the output token limit.');
        return parseJsonReply(text);
      }
    },
  };
}

// ------------------------------------------------- OpenAI-compatible APIs

interface OpenAiOptions {
  provider: string;
  supportsImages: boolean;
  evidenceBudgetChars: number;
  maxTokens: number;
  /** Attempts on 429/5xx before giving up (default 5). */
  maxAttempts?: number;
  /** Provider-specific request fields (e.g. Z.ai's `thinking`). */
  extraBody?: Record<string, unknown>;
}

/** Reads an OpenAI-style SSE stream and returns the concatenated message content. */
async function readStream(
  res: Response,
): Promise<{ content: string; finishReason: string | null }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: string | null = null;
  let lastReport = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
        };
        content += chunk.choices?.[0]?.delta?.content ?? '';
        finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
      } catch {
        // keep-alive or partial line; ignore
      }
    }
    if (Date.now() - lastReport > 20_000) {
      lastReport = Date.now();
      logLine(`    ...receiving (${Math.round(content.length / 1000)}k chars so far)`);
    }
  }
  return { content, finishReason };
}

function openAiCompatibleClient(
  baseUrl: string,
  key: string,
  model: string,
  opts: OpenAiOptions,
): LlmClient {
  return {
    provider: opts.provider,
    model,
    supportsImages: opts.supportsImages,
    evidenceBudgetChars: opts.evidenceBudgetChars,
    async generateJson({ system, prompt, images = [] }) {
      const content =
        images.length && opts.supportsImages
          ? [
              { type: 'text', text: prompt },
              ...images.map((i) => ({
                type: 'image_url',
                image_url: { url: `data:${i.mimeType};base64,${i.base64}` },
              })),
            ]
          : prompt;
      for (let attempt = 1; ; attempt++) {
        let res: Response;
        try {
          // Streamed, so long generations are not cut off by an idle HTTP timeout.
          res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              temperature: 0.2,
              max_tokens: opts.maxTokens,
              stream: true,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content },
              ],
              ...opts.extraBody,
            }),
          });
        } catch (err) {
          if (attempt >= 4) throw err;
          logLine(`    network error (${(err as Error).message}); retrying...`);
          await sleep(10_000 * attempt);
          continue;
        }
        if (!res.ok) {
          const raw = await res.text();
          if ((res.status === 429 || res.status >= 500) && attempt < (opts.maxAttempts ?? 5)) {
            const waitS = Math.min(90, Number(res.headers.get('retry-after')) || 20 * attempt);
            logLine(`    HTTP ${res.status} (${raw.slice(0, 160)}); waiting ${waitS}s...`);
            await sleep(waitS * 1000);
            continue;
          }
          throw new Error(`${opts.provider} HTTP ${res.status}: ${raw.slice(0, 500)}`);
        }
        const { content: text, finishReason } = await readStream(res);
        if (finishReason === 'length')
          throw new Error(`${opts.provider} reply was cut off at max_tokens (${opts.maxTokens}).`);
        if (!text.trim())
          throw new Error(
            `${opts.provider} returned an empty reply (finish_reason=${finishReason}).`,
          );
        return parseJsonReply(text);
      }
    },
  };
}

/** One tiny request with a 20 s limit: is the model serving requests right now? */
async function geminiAnswers(key: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Models that can read screenshots, in the order to try them, for describing
 * screenshots when the main model is text-only. Z.ai's free glm-4.6v-flash
 * first, then Gemini; VISION_PROVIDER (zai | gemini) restricts it to one.
 * Free tiers are often briefly overloaded, so callers fall through the list.
 */
export async function createVisionClients(env: NodeJS.ProcessEnv): Promise<LlmClient[]> {
  const geminiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  const only = env.VISION_PROVIDER;
  const clients: LlmClient[] = [];
  if (env.ZAI_API_KEY && (!only || only === 'zai')) {
    clients.push(
      openAiCompatibleClient(
        env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
        env.ZAI_API_KEY,
        env.ZAI_VISION_MODEL || 'glm-4.6v-flash',
        {
          provider: 'z.ai',
          supportsImages: true,
          evidenceBudgetChars: 0,
          maxTokens: 4_000,
          maxAttempts: 3,
          extraBody: { thinking: { type: 'disabled' } },
        },
      ),
    );
  }
  if (geminiKey && (!only || only === 'gemini')) {
    try {
      clients.push(geminiClient(geminiKey, env.GEMINI_MODEL || (await pickGeminiModel(geminiKey))));
    } catch {
      // Gemini unreachable (bad key or network); the other vision clients still work.
    }
  }
  return clients;
}

/**
 * Picks the provider: LLM_PROVIDER (gemini | zai | openai-compatible) when set,
 * otherwise Gemini if its key is present (vision + 1M context), then Z.ai.
 */
export async function createLlmClient(env: NodeJS.ProcessEnv): Promise<LlmClient | null> {
  const geminiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  let choice = env.LLM_PROVIDER || (geminiKey ? 'gemini' : env.ZAI_API_KEY ? 'zai' : '');
  if (choice === 'gemini') {
    if (!geminiKey) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set in .env.');
    const model = env.GEMINI_MODEL || (await pickGeminiModel(geminiKey));
    // Chosen by default rather than explicitly: if Gemini is not answering right
    // now (its free tier is often overloaded), fall back to Z.ai instead of failing.
    if (env.LLM_PROVIDER || !env.ZAI_API_KEY || (await geminiAnswers(geminiKey, model))) {
      return geminiClient(geminiKey, model);
    }
    logLine(`Gemini (${model}) is not answering right now; using Z.ai instead.`);
    choice = 'zai';
  }
  if (choice === 'zai' && !env.ZAI_API_KEY)
    throw new Error('LLM_PROVIDER=zai but ZAI_API_KEY is not set in .env.');
  if (choice === 'openai-compatible') {
    if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
      throw new Error(
        'LLM_PROVIDER=openai-compatible needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.',
      );
    }
    return openAiCompatibleClient(env.LLM_BASE_URL, env.LLM_API_KEY, env.LLM_MODEL, {
      provider: `openai-compatible (${new URL(env.LLM_BASE_URL).host})`,
      supportsImages: env.LLM_VISION === 'true',
      evidenceBudgetChars: Number(env.LLM_EVIDENCE_CHARS) || 250_000,
      maxTokens: Number(env.LLM_MAX_TOKENS) || 32_000,
    });
  }
  // Z.ai (Zhipu GLM). glm-4.5-flash is free; 128k context, text only.
  if (choice === 'zai' && env.ZAI_API_KEY) {
    const model = env.ZAI_MODEL || 'glm-4.5-flash';
    return openAiCompatibleClient(
      env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
      env.ZAI_API_KEY,
      model,
      {
        provider: 'z.ai',
        // Only the GLM "V" models (e.g. glm-4.5v) read images.
        supportsImages: /^glm-[\d.]+v/i.test(model),
        // ~128k-token window: ~75k tokens of evidence leaves room for instructions and the reply.
        evidenceBudgetChars: Number(env.LLM_EVIDENCE_CHARS) || 230_000,
        maxTokens: Number(env.LLM_MAX_TOKENS) || 32_000,
        // Structured extraction does not need the reasoning trace; disabling it keeps
        // replies fast and inside the output budget.
        extraBody: { thinking: { type: 'disabled' } },
      },
    );
  }
  return null;
}
