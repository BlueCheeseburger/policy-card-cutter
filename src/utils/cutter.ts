// The two AI-driving steps of the card cutter, ported from Warroom's
// electron/main.ts `ai:cutterReadSource` / `ai:cutterEmphasize` IPC handlers.
// Same prompts, same parsing/validation rules (including the "never launder a
// failure into a success" throws), running as direct browser calls instead of
// Electron IPC.

import cardCuttingSkill from '../skills/card_cutting.md?raw';
import { renderPrompt, capForPrompt } from './prompt';
import { callAI, callAIWithSearch, parseJsonLoose, loadSettings } from '../providers/ai';
import type { RawSource } from './readSource';
import type { AIClarification, CutterEmphasis, CutterSource, HighlightSpan } from '../types';

function citeYearRuleText(): string {
  const fmt = loadSettings().citeYearFormat ?? 'month-day';
  if (fmt === 'year') {
    return 'Current-year sources use a two-digit year short cite (e.g. "Brady 26"), same as past years — do NOT use a month-day short cite even for current-year sources.';
  }
  return 'Current-year sources use a month-day short cite (e.g. "Brady 3-15"); past years use a two-digit year.';
}

export async function cutterReadSource(raw: RawSource): Promise<CutterSource> {
  const today = new Date();
  let rawParagraphs = Array.from(new Set(raw.rawParagraphs)).slice(0, 400);
  if (!rawParagraphs.join('').trim()) throw new Error('No readable article text found in this file.');

  const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const numbered = capForPrompt(rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n'), 90000, 'this article');
  const imgList = raw.images.length ? raw.images.map((im, i) => `[${i}] ${im.alt ? 'alt: ' + im.alt : '(no alt text)'}`).join('\n') : '(none)';

  // Gemini can look up author credentials via Search grounding when they're
  // missing from the article text; other providers can't, so they get a
  // best-effort-from-context instruction instead.
  const usingGemini = loadSettings().provider === 'gemini' || !!loadSettings().auxGeminiKey;
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
