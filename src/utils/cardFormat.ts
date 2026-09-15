// Shared helpers for formatted card bodies (underline / highlight / small text).
// Ported near-verbatim from Warroom's src/utils/cardFormat.ts — pure TS, no
// Electron/Node dependencies, so this file needed no changes to run in a browser.

import type { CardRun, FontSize, HighlightColor } from '../types';

// Full-saturation highlight colors — same palette Verbatim/Word uses.
export const HIGHLIGHT_CSS: Record<HighlightColor, string> = {
  yellow: '#ffff00',
  cyan:   '#00ffff',
  green:  '#00ff00',
};

export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  yellow: '#ffff00',
  cyan:   '#00ffff',
  green:  '#00ff00',
};

// em scaling for each debate font size relative to the base body size.
export const FONT_SIZE_EM: Record<number, string> = {
  11: '1em',
  8:  '0.73em',
  6:  '0.55em',
  3:  '0.27em',
};

// Per-character emphasis attributes — the editable source of truth.
export interface CharAttr {
  u: boolean;                // underline — the cut, kept at full size; NOT itself read aloud
  hl: HighlightColor | null; // highlight — what's actually read aloud, within the underlined cut
  box: boolean;              // bordered box around the single most essential word/phrase
  fs: FontSize;              // 11 = normal; 8/6/3 = shrunk context (not read)
}

export function emptyAttrs(len: number): CharAttr[] {
  return Array.from({ length: len }, () => ({ u: false, hl: null, box: false, fs: 11 as FontSize }));
}

// A match starting mid-word (e.g. "in" landing inside "administrative") is never
// what the model intended — only accept matches that start at a word boundary.
function isWordStart(text: string, idx: number): boolean {
  if (idx === 0) return true;
  if (!/[A-Za-z0-9']/.test(text[idx])) return true;
  return !/[A-Za-z0-9']/.test(text[idx - 1]);
}

// Find every range of `sub` within `text`. Exact match first, then a
// whitespace-flexible match so minor whitespace drift from the model still lands.
function findRanges(text: string, sub: string): [number, number][] {
  const ranges: [number, number][] = [];
  const s = sub.trim();
  if (!s) return ranges;
  let idx = text.indexOf(s);
  while (idx !== -1) {
    if (isWordStart(text, idx)) ranges.push([idx, idx + s.length]);
    idx = text.indexOf(s, idx + s.length);
  }
  if (ranges.length) return ranges;
  const pattern = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  try {
    const re = new RegExp(pattern, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (isWordStart(text, m.index)) ranges.push([m.index, m.index + m[0].length]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  } catch {/* ignore bad pattern */}
  return ranges;
}

// Importance tier per highlight span: 1 = the handful of most-essential words,
// 2 = standard supporting emphasis, 3 = full/maximal emphasis. `highlightLevel`
// is the density slider position — showing tiers <= highlightLevel lets the
// density change re-render instantly from the single stored AI response, with
// no extra AI call per slider position.
export type HighlightLevel = 1 | 2 | 3;

// Apply AI-returned emphasis substrings onto the verbatim body, producing runs.
export function buildAttrsFromSpans(
  text: string,
  spans: { underline?: string[]; highlight?: { text: string; tier: HighlightLevel }[]; box?: string[]; small?: string[] },
  color: HighlightColor,
  highlightLevel: HighlightLevel = 3,
): CharAttr[] {
  const attrs = emptyAttrs(text.length);
  const mark = (subs: string[] | undefined, fn: (a: CharAttr) => void) => {
    for (const sub of subs ?? []) {
      for (const [a, b] of findRanges(text, sub)) {
        for (let i = a; i < b; i++) fn(attrs[i]);
      }
    }
  };
  // small first, then underline/highlight (emphasis wins over shrunk context).
  mark(spans.small, (a) => { a.fs = 8; });
  mark(spans.underline, (a) => { a.u = true; a.fs = 11; });
  const highlightAtLevel = (spans.highlight ?? []).filter((h) => h.tier <= highlightLevel).map((h) => h.text);
  mark(highlightAtLevel, (a) => { a.hl = color; a.u = true; a.fs = 11; });
  // Box is unconditional, like underline — it marks the single most essential
  // word/phrase within the highlight, not a fourth density level to filter.
  mark(spans.box, (a) => { a.box = true; a.u = true; a.fs = 11; });
  return attrs;
}

export function runsFromAttrs(text: string, attrs: CharAttr[]): CardRun[] {
  const runs: CardRun[] = [];
  let cur: (CardRun & { _key: string }) | null = null;
  for (let i = 0; i < text.length; i++) {
    const a = attrs[i] ?? { u: false, hl: null, box: false, fs: 11 as FontSize };
    const key = `${a.u}|${a.hl ?? ''}|${a.box}|${a.fs}`;
    if (cur && cur._key === key) {
      cur.text += text[i];
    } else {
      cur = { _key: key, text: text[i], underline: a.u || undefined, highlight: a.hl ?? undefined, box: a.box || undefined, fontSize: a.fs !== 11 ? a.fs : undefined };
      runs.push(cur);
    }
  }
  return runs.map(({ text: t, underline, highlight, box, fontSize }) => {
    const run: CardRun = { text: t };
    if (underline) run.underline = true;
    if (highlight) run.highlight = highlight;
    if (box) run.box = true;
    if (fontSize) run.fontSize = fontSize;
    return run;
  });
}

export function runsToPlain(runs: CardRun[] | undefined): string {
  return (runs ?? []).map((r) => r.text).join('');
}
