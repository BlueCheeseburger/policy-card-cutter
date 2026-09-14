// Direct-from-browser AI provider calls — "bring your own key". No backend:
// the user's API key is stored in localStorage and used to call the provider's
// API straight from the page. Ported from Warroom's electron/main.ts callAI
// dispatcher (Node/Electron) to plain browser fetch() calls.
//
// CORS caveat (flagged in Settings, not just here): Gemini and Anthropic both
// serve CORS headers that let a browser call them directly — Anthropic needs
// the `anthropic-dangerous-direct-browser-access` header, which is set below.
// OpenAI and xAI's chat-completions endpoints do NOT send CORS headers for
// arbitrary origins, so calls to those two providers will fail in-browser with
// a CORS error, not a code bug — there is no backend here to proxy around it.
// Gemini or Anthropic are the two providers this app can actually reach.

import type { AIProvider } from '../types';

export type ModelTier = 'balanced' | 'best';

const MODEL_TIER_IDS: Record<AIProvider, Record<ModelTier, string>> = {
  gemini:    { balanced: 'gemini-2.5-flash',      best: 'gemini-3.7-flash' },
  openai:    { balanced: 'gpt-5.6-terra',         best: 'gpt-5.6-sol' },
  anthropic: { balanced: 'claude-sonnet-5',       best: 'claude-opus-5' },
  grok:      { balanced: 'grok-4.3',              best: 'grok-4.6' },
};

const SETTINGS_KEY = 'pcc-settings';

export interface Settings {
  provider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
  // Optional aux Gemini key used only for Google Search grounding (author
  // credential lookups) when the main provider isn't Gemini.
  auxGeminiKey?: string;
  // Current-year short-cite style: "Brady 3-15" (month-day) vs "Brady 26" (year).
  citeYearFormat?: 'month-day' | 'year';
}

const DEFAULT_SETTINGS: Settings = { provider: 'gemini', apiKeys: {} };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, apiKeys: { ...parsed.apiKeys } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function truncatedResponseError(provider: string, partial: string): Error {
  const chars = (partial ?? '').length;
  return new Error(
    `TRUNCATED: ${provider} cut the response off at its output-token limit ` +
    `(got ${chars.toLocaleString()} characters, ending: "…${(partial ?? '').slice(-80).trim()}"). ` +
    `The request was too large to answer in one call.`,
  );
}

// ─── Gemini ───────────────────────────────────────────────────────────────

function geminiGenerateUrl(modelId: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
}
function geminiHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}
function geminiHttpError(status: number, body: string): Error {
  let parsed: any;
  try { parsed = JSON.parse(body)?.error; } catch { /* not JSON */ }
  if (parsed?.message) return new Error(`Gemini [${status}${parsed.status ? ' ' + parsed.status : ''}]: ${parsed.message}`);
  if (status === 429) return new Error('Gemini rate limit reached — wait a moment and try again.');
  if (status === 503) return new Error('Gemini is overloaded right now. Try again in a few seconds.');
  if (status === 403 || status === 400) return new Error(`Gemini rejected the request (HTTP ${status}) — check your API key in Settings.`);
  return new Error(`Gemini request failed (HTTP ${status}) — try again shortly.`);
}

async function callGemini(apiKey: string, prompt: string, modelId: string, maxOutputTokens: number, withSearch = false): Promise<string> {
  const res = await fetch(geminiGenerateUrl(modelId), {
    method: 'POST',
    headers: geminiHeaders(apiKey),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.1, maxOutputTokens },
    }),
  });
  if (!res.ok) throw geminiHttpError(res.status, await res.text().catch(() => ''));
  const data = await res.json() as any;
  const candidate = data?.candidates?.[0];
  const parts: any[] = candidate?.content?.parts ?? [];
  const text = parts.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join('');
  const finish = candidate?.finishReason;
  if (typeof text !== 'string' || (!text && !finish)) throw new Error('Unexpected Gemini response shape');
  if (finish === 'MAX_TOKENS') throw truncatedResponseError('Gemini', text);
  if (!text) throw new Error(`Gemini returned no text (finishReason: ${finish}).`);
  return text;
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

function openaiHttpError(status: number, body: string): Error {
  let parsed: any;
  try { parsed = JSON.parse(body)?.error; } catch {}
  if (parsed?.message) {
    const type = parsed.type || parsed.code;
    return new Error(`OpenAI [${status}${type ? ' ' + type : ''}]: ${parsed.message}`);
  }
  if (status === 429) return new Error('OpenAI rate limit reached — wait a moment and try again.');
  if (status === 503) return new Error('OpenAI is busy right now — try again in a moment.');
  if (status === 401 || status === 403) return new Error('OpenAI rejected the API key — check your key in Settings.');
  return new Error(`OpenAI request failed (HTTP ${status}) — try again shortly. If this is a network error, it is likely CORS: OpenAI's API does not allow direct browser calls.`);
}

async function callOpenAI(apiKey: string, prompt: string, modelId: string, maxOutputTokens: number): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxOutputTokens,
    }),
  });
  if (!res.ok) throw openaiHttpError(res.status, await res.text().catch(() => ''));
  const data = await res.json() as any;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected OpenAI response shape');
  if (data?.choices?.[0]?.finish_reason === 'length') throw truncatedResponseError('OpenAI', text);
  return text;
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

function anthropicHttpError(status: number, body: string): Error {
  let parsed: any;
  try { parsed = JSON.parse(body)?.error; } catch {}
  if (parsed?.message) return new Error(`Anthropic [${status}${parsed.type ? ' ' + parsed.type : ''}]: ${parsed.message}`);
  if (status === 429) return new Error('Anthropic rate limit reached — wait a moment and try again.');
  if (status === 529) return new Error('Anthropic is overloaded right now — try again in a moment.');
  if (status === 401) return new Error('Anthropic rejected the API key — check your key in Settings.');
  return new Error(`Anthropic request failed (HTTP ${status}) — try again shortly.`);
}

async function callAnthropic(apiKey: string, prompt: string, modelId: string, maxOutputTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for a browser-origin request — without it Anthropic's API
      // refuses the request outright (not just a CORS preflight failure).
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxOutputTokens,
    }),
  });
  if (!res.ok) throw anthropicHttpError(res.status, await res.text().catch(() => ''));
  const data = await res.json() as any;
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Unexpected Anthropic response shape');
  if (data?.stop_reason === 'max_tokens') throw truncatedResponseError('Anthropic', text);
  return text;
}

// ─── xAI (Grok) ─────────────────────────────────────────────────────────────

function grokHttpError(status: number, body: string): Error {
  let parsed: any;
  try { parsed = JSON.parse(body)?.error; } catch {}
  if (parsed?.message) {
    const type = parsed.type || parsed.code;
    return new Error(`Grok [${status}${type ? ' ' + type : ''}]: ${parsed.message}`);
  }
  if (status === 429) return new Error('Grok rate limit reached — wait a moment and try again.');
  if (status === 401 || status === 403) return new Error('xAI rejected the API key — check your Grok key in Settings.');
  return new Error(`Grok request failed (HTTP ${status}) — try again shortly. If this is a network error, it is likely CORS: xAI's API does not allow direct browser calls.`);
}

async function callGrok(apiKey: string, prompt: string, modelId: string, maxOutputTokens: number): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxOutputTokens,
    }),
  });
  if (!res.ok) throw grokHttpError(res.status, await res.text().catch(() => ''));
  const data = await res.json() as any;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected Grok response shape');
  if (data?.choices?.[0]?.finish_reason === 'length') throw truncatedResponseError('Grok', text);
  return text;
}

// ─── Unified single-call entry points ──────────────────────────────────────

export function isTruncatedResponse(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('TRUNCATED:');
}

export async function callAI(prompt: string, tier: ModelTier, maxOutputTokens = 8192): Promise<string> {
  const settings = loadSettings();
  const { provider } = settings;
  const apiKey = settings.apiKeys[provider];
  if (!apiKey) throw new Error(`NO_KEY: add your ${provider} API key in Settings.`);
  const modelId = MODEL_TIER_IDS[provider][tier];
  if (provider === 'gemini') return callGemini(apiKey, prompt, modelId, maxOutputTokens);
  if (provider === 'openai') return callOpenAI(apiKey, prompt, modelId, maxOutputTokens);
  if (provider === 'anthropic') return callAnthropic(apiKey, prompt, modelId, maxOutputTokens);
  return callGrok(apiKey, prompt, modelId, maxOutputTokens);
}

// Gemini-specific call with Google Search grounding enabled — used to look up
// author credentials when they aren't present in the article text. Falls back
// to the optional aux Gemini key (Settings) when the main provider isn't
// Gemini, and to a plain non-grounded call if no Gemini key exists anywhere.
export async function callAIWithSearch(prompt: string, maxOutputTokens = 4096): Promise<string> {
  const settings = loadSettings();
  if (settings.provider === 'gemini') {
    const apiKey = settings.apiKeys.gemini;
    if (!apiKey) throw new Error('NO_KEY: add your Gemini API key in Settings.');
    return callGemini(apiKey, prompt, MODEL_TIER_IDS.gemini.balanced, maxOutputTokens, true);
  }
  const auxKey = settings.auxGeminiKey;
  if (auxKey) return callGemini(auxKey, prompt, MODEL_TIER_IDS.gemini.balanced, maxOutputTokens, true);
  return callAI(prompt, 'balanced', maxOutputTokens);
}

// Tolerant JSON parser for model output that may be fenced or wrapped in prose.
export function parseJsonLoose(raw: string): any {
  const cleaned = (raw ?? '').replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const os = cleaned.indexOf('{'), oe = cleaned.lastIndexOf('}');
  if (os !== -1 && oe > os) { try { return JSON.parse(cleaned.slice(os, oe + 1)); } catch {} }
  const as = cleaned.indexOf('['), ae = cleaned.lastIndexOf(']');
  if (as !== -1 && ae > as) { try { return JSON.parse(cleaned.slice(as, ae + 1)); } catch {} }
  return null;
}

// Friendlier, paraphrased error for inline UI use (mirrors Warroom's humanizeGeminiError).
export function humanizeAiError(raw: string | undefined | null): string {
  const msg = (raw ?? '').toLowerCase();
  const settings = loadSettings();
  const name = settings.provider === 'gemini' ? 'Gemini' : settings.provider === 'openai' ? 'OpenAI' : settings.provider === 'anthropic' ? 'Claude' : 'Grok';

  if (msg.startsWith('no_key')) return `Add your ${name} API key in Settings to use AI features.`;
  if (msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429') || msg.includes('rate limit'))
    return `You've hit your ${name} usage limit. Wait a minute, then try again.`;
  if (msg.includes('api_key_invalid') || msg.includes('invalid api key') || msg.includes('api key not valid') || msg.includes('rejected the api key') || msg.includes('rejected the request'))
    return `Your ${name} API key isn't working. Double-check it in Settings.`;
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors'))
    return `Couldn't reach ${name} from the browser — this may be a CORS restriction. Gemini and Anthropic are the two providers this app can call directly; OpenAI and Grok generally can't be called from a browser without a backend.`;
  if (msg.includes('permission_denied') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('401'))
    return `${name} rejected the request — your API key may not have access to this model.`;
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harm'))
    return `${name} flagged that response for safety reasons. Try rephrasing.`;
  if (msg.includes('overload') || msg.includes('unavailable') || msg.includes('503'))
    return `${name} is overloaded right now. Try again in a few seconds.`;
  if (msg.startsWith('truncated:'))
    return `${name} cut the response off — it was too large to answer in one call. Try selecting less text.`;
  if (raw && raw.length > 0 && raw.length < 160) return raw;
  return `Something went wrong with ${name}. Try again.`;
}
