// Replaces Warroom's `window.warroom.ai.*` IPC namespace. CardCutter.tsx only
// ever called two methods on it — `cutterReadSource(filePath)` and
// `cutterEmphasize(params)` — so those are exactly what this module exports,
// same names, same return shapes. The one deliberate signature change:
// `cutterReadSource` took a real filesystem path in Electron (main.ts read it
// with `fs`); here it takes the opaque handle `platform/files.ts` hands back
// from a file/folder pick, and resolves it back to the actual File(s) itself.
// `highlightColor` is dropped from `cutterEmphasize`'s params — Warroom's own
// handler destructured it but never referenced it in the prompt (recoloring
// happens client-side, after the fact, via `buildAttrsFromSpans`), so keeping
// it would only be a decoy parameter.
//
// Everything below the two exported functions — the raw per-provider fetch
// calls — has no Warroom equivalent to shim at all: in Electron this logic
// ran in the trusted main process, invisible to any component. Porting the
// feature to a plain browser tab means that work has nowhere left to live but
// here, called directly from the page with a user-supplied key. See the
// CORS note below and the README for what that costs.

import cardCuttingSkill from '../skills/card_cutting.md?raw';
import type { AIProvider, AIClarification, CutterEmphasis, CutterSource, HighlightSpan } from '../types';
import { readSettings } from './settings';
import { resolveFile, resolveFolder, isFolderHandle } from './files';
import { readSingleFile, readFolderSource } from '../utils/readSource';
import { renderPrompt, capForPrompt } from '../utils/prompt';

// ─── The two feature contracts CardCutter.tsx calls ────────────────────────

export async function cutterReadSource(fileHandle: string): Promise<CutterSource> {
  const raw = isFolderHandle(fileHandle)
    ? await (async () => {
        const files = resolveFolder(fileHandle);
        if (!files) throw new Error('That source is no longer available — pick it again.');
        return readFolderSource(files);
      })()
    : await (async () => {
        const file = resolveFile(fileHandle);
        if (!file) throw new Error('That source is no longer available — pick it again.');
        return readSingleFile(file);
      })();

  const today = new Date();
  const rawParagraphs = Array.from(new Set(raw.rawParagraphs)).slice(0, 400);
  if (!rawParagraphs.join('').trim()) throw new Error('No readable article text found in this file.');

  const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const numbered = capForPrompt(rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n'), 90000, 'this article');
  const imgList = raw.images.length ? raw.images.map((im, i) => `[${i}] ${im.alt ? 'alt: ' + im.alt : '(no alt text)'}`).join('\n') : '(none)';

  // Gemini can look up author credentials via Search grounding when they're
  // missing from the article text; other providers can't, so they get a
  // best-effort-from-context instruction instead.
  const settings = readSettings();
  const usingGemini = settings.provider === 'gemini' || !!settings.auxGeminiKey;
  const credentialsInstruction = usingGemini
    ? 'IMPORTANT: if the author\'s credentials (title, affiliation, expertise) are not present in the article text, use Google Search to look them up by name and publication — a cite without credentials is incomplete.'
    : 'IMPORTANT: if the author\'s credentials are not present in the article text, make your best effort from context clues, or write "credentials not found" in that position.';

  const prompt = renderPrompt('cutter_read_source', {
    IMAGES_NOTE: raw.images.length ? ', plus a list of its images' : '',
    TODAY_STR: todayStr,
    CARD_CUTTING_SKILL: cardCuttingSkill,
    CURRENT_YEAR: String(today.getFullYear()),
    META_URL_OR_NOTE: raw.metaUrl || '(none — omit the URL)',
    CREDENTIALS_INSTRUCTION: credentialsInstruction,
    CITE_YEAR_RULE: citeYearRuleText(),
    PARAGRAPHS: numbered,
    IMAGES: imgList,
  });

  const readRaw = await callAIWithSearch(prompt, 4096);
  const parsed = parseJsonLoose(readRaw);
  if (!parsed) {
    throw new Error(`Warroom AI could not read this source — its reply wasn't valid JSON. First 300 characters: ${JSON.stringify(readRaw.slice(0, 300))}`);
  }

  const bodyIndices: number[] = Array.isArray(parsed.bodyIndices)
    ? parsed.bodyIndices.filter((n: any) => Number.isInteger(n) && n >= 0 && n < rawParagraphs.length)
    : [];
  const paragraphs = bodyIndices.length ? bodyIndices.map((i) => rawParagraphs[i]) : rawParagraphs;
  const imgIdx = new Set<number>(Array.isArray(parsed.imageIndices) ? parsed.imageIndices : []);
  const outImages = raw.images.map((im, i) => ({ src: im.src, alt: im.alt, suggested: imgIdx.has(i) }));
  const year = Number(String(parsed.year).match(/\d{4}/)?.[0]) || today.getFullYear();

  return {
    ok: true,
    kind: raw.kind,
    cite: String(parsed.cite ?? '').trim(),
    author: String(parsed.author ?? '').trim(),
    title: String(parsed.title ?? raw.metaTitle ?? '').trim(),
    year,
    url: String(parsed.url ?? raw.metaUrl ?? '').trim(),
    paragraphs,
    images: outImages,
  };
}

export async function cutterEmphasize(params: {
  body: string;
  intent: string;
  cite?: string;
  clarifications?: AIClarification[];
  refineInstruction?: string;
  previous?: { underline?: string[]; highlight?: HighlightSpan[]; small?: string[] };
}): Promise<CutterEmphasis> {
  const text = String(params.body ?? '').trim();
  if (!text) throw new Error('No card body text to cut.');
  const clar = params.clarifications ?? [];

  const refine = String(params.refineInstruction ?? '').trim();
  const refinementNote = refine
    ? `\nREFINEMENT PASS — you already cut this card once. Your previous emphasis was:\n` +
      `${JSON.stringify({
        underline: params.previous?.underline ?? [],
        highlightTier1: (params.previous?.highlight ?? []).filter((h) => h.tier === 1).map((h) => h.text),
        highlightTier2: (params.previous?.highlight ?? []).filter((h) => h.tier === 2).map((h) => h.text),
        highlightTier3: (params.previous?.highlight ?? []).filter((h) => h.tier === 3).map((h) => h.text),
        small: params.previous?.small ?? [],
      })}\n` +
      `The debater wants this changed: "${refine}"\n` +
      `Apply that change and return a COMPLETE new emphasis set in the same format — not just the parts that changed. Keep everything they did not ask you to change. Do NOT ask a clarifying question on a refinement pass; make your best call.\n`
    : '';

  const prompt = renderPrompt('cutter_emphasize', {
    CARD_CUTTING_SKILL: cardCuttingSkill,
    CITE_NOTE: params.cite ? ` (cite: ${params.cite})` : '',
    INTENT_NOTE: params.intent ? `"${params.intent}"` : '(not specified — infer the strongest argument)',
    BODY_TEXT: capForPrompt(text, 40000, 'the card body'),
    CLARIFICATIONS_JSON: clar.length ? JSON.stringify(clar) : '(none yet)',
    QUESTIONS_ASKED: refine ? '1' : String(clar.length),
    REFINEMENT_NOTE: refinementNote,
  });

  const emphRaw = await callAI(prompt, 'best', 32768);
  const parsed = parseJsonLoose(emphRaw);
  if (!parsed) throw new Error(`Warroom AI could not cut this card — its reply wasn't valid JSON. First 300 characters: ${JSON.stringify(emphRaw.slice(0, 300))}`);
  if (parsed?.question?.question && Array.isArray(parsed.question.options)) {
    return { ok: true, question: parsed.question, taglines: [], underline: [], highlight: [], small: [] };
  }

  const arr = (v: any): string[] => Array.isArray(v) ? v.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim()) : [];
  const highlight: HighlightSpan[] = [
    ...arr(parsed.highlightTier1).map((t) => ({ text: t, tier: 1 as const })),
    ...arr(parsed.highlightTier2).map((t) => ({ text: t, tier: 2 as const })),
    ...arr(parsed.highlightTier3).map((t) => ({ text: t, tier: 3 as const })),
  ];
  // Legacy fallback if the three-tier arrays came back empty (schema-drift guard).
  if (highlight.length === 0 && Array.isArray(parsed.highlight)) {
    for (const item of parsed.highlight) {
      if (typeof item === 'string' && item.trim()) highlight.push({ text: item.trim(), tier: 2 });
      else if (item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()) {
        highlight.push({ text: item.text.trim(), tier: [1, 2, 3].includes(item.tier) ? item.tier : 2 });
      }
    }
  }
  let taglines = arr(parsed.taglines).map((t) => t.replace(/^#+\s*/, '').trim()).slice(0, 2);
  if (taglines.length === 0 && arr(parsed.underline).length === 0) {
    throw new Error('Warroom AI returned no tagline and nothing to underline for this card. Try cutting it again.');
  }
  if (highlight.length === 0) {
    throw new Error('Warroom AI returned no highlighting for this card. Try cutting it again.');
  }
  if (taglines.length === 0) taglines = ['Untitled card'];
  return { ok: true, taglines, underline: arr(parsed.underline), highlight, small: arr(parsed.small) };
}

function citeYearRuleText(): string {
  const fmt = readSettings().citeYearFormat ?? 'month-day';
  if (fmt === 'year') {
    return 'Current-year sources use a two-digit year short cite (e.g. "Brady 26"), same as past years — do NOT use a month-day short cite even for current-year sources.';
  }
  return 'Current-year sources use a month-day short cite (e.g. "Brady 3-15"); past years use a two-digit year.';
}

// ─── Provider-calling engine (no Warroom equivalent — see file header) ─────
//
// CORS caveat, flagged again in Settings: Gemini and Anthropic both serve
// CORS headers that let a browser call them directly — Anthropic needs the
// `anthropic-dangerous-direct-browser-access` header, set below. OpenAI and
// xAI's chat-completions endpoints do NOT send CORS headers for arbitrary
// origins, so calls to those two will fail in-browser with a network error,
// not a code bug — there is no backend here to proxy around it.

type ModelTier = 'balanced' | 'best';

const MODEL_TIER_IDS: Record<AIProvider, Record<ModelTier, string>> = {
  gemini:    { balanced: 'gemini-2.5-flash', best: 'gemini-3.7-flash' },
  openai:    { balanced: 'gpt-5.6-terra',    best: 'gpt-5.6-sol' },
  anthropic: { balanced: 'claude-sonnet-5',  best: 'claude-opus-5' },
  grok:      { balanced: 'grok-4.3',         best: 'grok-4.6' },
};

function truncatedResponseError(provider: string, partial: string): Error {
  const chars = (partial ?? '').length;
  return new Error(
    `TRUNCATED: ${provider} cut the response off at its output-token limit ` +
    `(got ${chars.toLocaleString()} characters, ending: "…${(partial ?? '').slice(-80).trim()}"). ` +
    `The request was too large to answer in one call.`,
  );
}

export function isTruncatedResponse(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('TRUNCATED:');
}

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

async function callAI(prompt: string, tier: ModelTier, maxOutputTokens = 8192): Promise<string> {
  const settings = readSettings();
  const { provider } = settings;
  const apiKey = settings.apiKeys[provider];
  if (!apiKey) throw new Error(`NO_KEY: add your ${provider} API key in Settings.`);
  const modelId = MODEL_TIER_IDS[provider][tier];
  if (provider === 'gemini') return callGemini(apiKey, prompt, modelId, maxOutputTokens);
  if (provider === 'openai') return callOpenAI(apiKey, prompt, modelId, maxOutputTokens);
  if (provider === 'anthropic') return callAnthropic(apiKey, prompt, modelId, maxOutputTokens);
  return callGrok(apiKey, prompt, modelId, maxOutputTokens);
}

async function callAIWithSearch(prompt: string, maxOutputTokens = 4096): Promise<string> {
  const settings = readSettings();
  if (settings.provider === 'gemini') {
    const apiKey = settings.apiKeys.gemini;
    if (!apiKey) throw new Error('NO_KEY: add your Gemini API key in Settings.');
    return callGemini(apiKey, prompt, MODEL_TIER_IDS.gemini.balanced, maxOutputTokens, true);
  }
  const auxKey = settings.auxGeminiKey;
  if (auxKey) return callGemini(auxKey, prompt, MODEL_TIER_IDS.gemini.balanced, maxOutputTokens, true);
  return callAI(prompt, 'balanced', maxOutputTokens);
}

function parseJsonLoose(raw: string): any {
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
  const settings = readSettings();
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
