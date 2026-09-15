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
import type { AIClarification, CutterEmphasis, CutterSource, HighlightSpan } from '../types';
import type { PromptName } from './settings';
import { readSettings, writeSettings } from './settings';
import { resolveFile, resolveFolder, isFolderHandle } from './files';
import { readSingleFile, readFolderSource } from '../utils/readSource';
import { renderPrompt, capForPrompt, getBundledPromptTemplate, PROMPT_NAMES } from '../utils/prompt';

// The bundled, as-shipped text for everything the Settings → Prompts editor
// lists — the two AI prompts plus the card-cutting skill markdown, which is
// injected into both prompts as {{CARD_CUTTING_SKILL}}. Edits are stored as a
// full-text override in Settings and checked here before falling back to
// this bundled copy.
function bundledPromptText(name: PromptName): string {
  return name === 'card_cutting_skill' ? cardCuttingSkill : getBundledPromptTemplate(name);
}

function currentSkillText(): string {
  return readSettings().promptOverrides?.card_cutting_skill ?? cardCuttingSkill;
}

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
    CARD_CUTTING_SKILL: currentSkillText(),
    CURRENT_YEAR: String(today.getFullYear()),
    META_URL_OR_NOTE: raw.metaUrl || '(none — omit the URL)',
    CREDENTIALS_INSTRUCTION: credentialsInstruction,
    CITE_YEAR_RULE: citeYearRuleText(),
    PARAGRAPHS: numbered,
    IMAGES: imgList,
  }, settings.promptOverrides?.cutter_read_source);

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
  previous?: { underline?: string[]; highlight?: HighlightSpan[]; box?: string[]; small?: string[] };
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
        box: params.previous?.box ?? [],
        small: params.previous?.small ?? [],
      })}\n` +
      `The debater wants this changed: "${refine}"\n` +
      `Apply that change and return a COMPLETE new emphasis set in the same format — not just the parts that changed. Keep everything they did not ask you to change. Do NOT ask a clarifying question on a refinement pass; make your best call.\n`
    : '';

  const prompt = renderPrompt('cutter_emphasize', {
    CARD_CUTTING_SKILL: currentSkillText(),
    CITE_NOTE: params.cite ? ` (cite: ${params.cite})` : '',
    INTENT_NOTE: params.intent ? `"${params.intent}"` : '(not specified — infer the strongest argument)',
    BODY_TEXT: capForPrompt(text, 40000, 'the card body'),
    CLARIFICATIONS_JSON: clar.length ? JSON.stringify(clar) : '(none yet)',
    QUESTIONS_ASKED: refine ? '1' : String(clar.length),
    REFINEMENT_NOTE: refinementNote,
  }, readSettings().promptOverrides?.cutter_emphasize);

  const emphRaw = await callAI(prompt, 32768);
  const parsed = parseJsonLoose(emphRaw);
  if (!parsed) throw new Error(`Warroom AI could not cut this card — its reply wasn't valid JSON. First 300 characters: ${JSON.stringify(emphRaw.slice(0, 300))}`);
  if (parsed?.question?.question && Array.isArray(parsed.question.options)) {
    return { ok: true, question: parsed.question, taglines: [], underline: [], highlight: [], box: [], small: [] };
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
  return { ok: true, taglines, underline: arr(parsed.underline), highlight, box: arr(parsed.box), small: arr(parsed.small) };
}

// ─── Prompt editor (Settings page) ──────────────────────────────────────────
// Read-and-edit access to everything sent to the model: the two AI prompts,
// plus the card-cutting skill markdown they both embed. An edit is stored as
// a full replacement in Settings, checked above before falling back to the
// bundled file — same "user override beats bundled default" shape as
// Warroom's own user-editable prompts (userPromptsDir checked before
// bundledPromptsDir).

export function promptNames(): PromptName[] {
  return [...PROMPT_NAMES, 'card_cutting_skill'] as PromptName[];
}

export function promptSource(name: PromptName): string {
  return readSettings().promptOverrides?.[name] ?? bundledPromptText(name);
}

export function isPromptOverridden(name: PromptName): boolean {
  return readSettings().promptOverrides?.[name] !== undefined;
}

export function savePromptOverride(name: PromptName, text: string): void {
  const current = readSettings();
  writeSettings({ promptOverrides: { ...current.promptOverrides, [name]: text } });
}

export function resetPromptOverride(name: PromptName): void {
  const current = readSettings();
  const next = { ...current.promptOverrides };
  delete next[name];
  writeSettings({ promptOverrides: next });
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
// Only three providers are offered, all of which a browser tab can actually
// reach with no backend:
//   • Gemini — sends CORS headers on generativelanguage.googleapis.com.
//   • Anthropic — needs the `anthropic-dangerous-direct-browser-access`
//     header (set below), without which it refuses the request outright.
//   • LM Studio — the user's own machine. The page is HTTPS and LM Studio is
//     http://localhost, which Chrome/Edge/Firefox treat as trustworthy;
//     Safari blocks it. LM Studio's own CORS setting also has to be on.
// OpenAI and xAI were dropped entirely: their chat-completions APIs never
// send CORS headers for a browser origin, so a call to either always failed
// with a network error here — there was no working path to keep.
//
// There is no tier/model-picker abstraction: the user types the exact model
// name their provider expects (Settings → AI), and every call uses it as-is.

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

async function callLmStudio(baseUrl: string, modelName: string, prompt: string, maxOutputTokens: number): Promise<string> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName || 'local-model',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxOutputTokens,
    }),
  }).catch((e) => {
    throw new Error(
      `Could not reach LM Studio at ${base} (${e?.message || 'network error'}). ` +
      `Make sure the local server is running and its CORS setting is on. Safari blocks this entirely — use Chrome, Edge, or Firefox.`,
    );
  });
  if (!res.ok) throw new Error(`LM Studio [${res.status}]: ${(await res.text().catch(() => '')).slice(0, 300) || 'request failed'}`);
  const data = await res.json() as any;
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected LM Studio response shape');
  if (choice?.finish_reason === 'length') throw truncatedResponseError('LM Studio', text);
  if (!text) throw new Error('LM Studio returned an empty response.');
  return text;
}

async function callAI(prompt: string, maxOutputTokens = 8192): Promise<string> {
  const s = readSettings();
  if (s.provider === 'lmstudio') {
    if (!s.lmStudioUrl.trim()) throw new Error('NO_KEY: add your LM Studio server address in Settings.');
    return callLmStudio(s.lmStudioUrl, s.lmStudioModel, prompt, maxOutputTokens);
  }
  const apiKey = s.apiKeys[s.provider];
  if (!apiKey) throw new Error(`NO_KEY: add your ${s.provider} API key in Settings.`);
  if (s.provider === 'gemini') return callGemini(apiKey, prompt, s.geminiModel || 'gemini-2.5-flash', maxOutputTokens);
  return callAnthropic(apiKey, prompt, s.anthropicModel, maxOutputTokens);
}

// Gemini-specific call with Google Search grounding — used to look up author
// credentials when they aren't present in the article text. Falls back to
// the optional aux Gemini key (Settings) when the main provider isn't
// Gemini, and to a plain non-grounded call if no Gemini key exists anywhere.
async function callAIWithSearch(prompt: string, maxOutputTokens = 4096): Promise<string> {
  const s = readSettings();
  if (s.provider === 'gemini') {
    const apiKey = s.apiKeys.gemini;
    if (!apiKey) throw new Error('NO_KEY: add your Gemini API key in Settings.');
    return callGemini(apiKey, prompt, s.geminiModel || 'gemini-2.5-flash', maxOutputTokens, true);
  }
  const auxKey = s.auxGeminiKey;
  if (auxKey) return callGemini(auxKey, prompt, 'gemini-2.5-flash', maxOutputTokens, true);
  return callAI(prompt, maxOutputTokens);
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
  const s = readSettings();
  const name = s.provider === 'gemini' ? 'Gemini' : s.provider === 'anthropic' ? 'Claude' : 'LM Studio';

  if (s.provider === 'lmstudio') {
    if (msg.startsWith('no_key')) return 'Add your LM Studio server address in Settings.';
    if (msg.includes('could not reach lm studio')) return raw as string;
    if (raw && raw.length > 0 && raw.length < 200) return raw;
    return 'LM Studio ran into a problem. Check that the local server is running.';
  }

  if (msg.startsWith('no_key')) return `Add your ${name} API key in Settings to use AI features.`;
  if (msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429') || msg.includes('rate limit'))
    return `You've hit your ${name} usage limit. Wait a minute, then try again.`;
  if (msg.includes('api_key_invalid') || msg.includes('invalid api key') || msg.includes('api key not valid') || msg.includes('rejected the api key') || msg.includes('rejected the request'))
    return `Your ${name} API key isn't working. Double-check it in Settings.`;
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors'))
    return `Couldn't reach ${name} from the browser — this may be a CORS restriction.`;
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
