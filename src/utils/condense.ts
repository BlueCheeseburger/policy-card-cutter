// Condensing a card body — same rules as CardMirror's condense (its
// src/editor/condense.ts, spec confirmed by that project's session):
//
//   Whitespace cleanup, always, on every paragraph: tabs, NBSP and other
//   Unicode spaces and in-text line breaks become one space; soft hyphens and
//   zero-width characters are deleted; runs of spaces collapse to one; leading
//   spaces are stripped. Paragraphs that end up empty are dropped.
//
//   "Preserve paragraph integrity" ON (CardMirror's default): cleanup only —
//   paragraphs stay separate.
//   OFF + "Use pilcrow markers" ON (default): paragraphs merge into one, joined
//   by a 6-pt "¶" so the merge is reversible.
//   OFF + pilcrows OFF: paragraphs merge into one, joined by a single space.
//
//   "Condense With Warning": merged like Branch A, then wrapped in a
//   "[PARAGRAPH INTEGRITY PAUSES]" line before and a "[PARAGRAPH INTEGRITY
//   RESUMES]" line after, using the chosen marker delimiter.
//   "Uncondense" is just switching back to paragraphs-kept.
//
// CardMirror's heading-handling and paste options govern tags, cites and
// pasted text inside a Word-style editor; a card body here is only ever body
// paragraphs, so those two don't apply.

export const PILCROW = '¶'; // U+00B6

export function cleanParagraph(text: string): string {
  return text
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\t\r\n\v\f\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// The four ways a card body can be laid out — CardMirror's Condense (integrity
// on), Condense Without Paragraph Integrity, ... (With Pilcrows), and
// Condense With Warning. Switching back to 'integrity' is its Uncondense.
export type CondenseMode = 'integrity' | 'merge' | 'pilcrow' | 'warning';

export const CONDENSE_MODE_LABELS: Record<CondenseMode, string> = {
  integrity: 'Paragraphs kept',
  merge: 'Condensed',
  pilcrow: 'Condensed with ¶',
  warning: 'Condensed with warning',
};

// CardMirror's "marker delimiter" setting.
export type WarningDelimiter = '[' | '[[' | '<' | '<<' | '{' | '{{' | 'custom';
export const WARNING_DELIMITERS: WarningDelimiter[] = ['[', '[[', '<', '<<', '{', '{{', 'custom'];

export interface WarningMarkers { pause: string; resume: string }

const CLOSERS: Record<string, string> = { '[': ']', '[[': ']]', '<': '>', '<<': '>>', '{': '}', '{{': '}}' };

export function warningMarkers(delimiter: WarningDelimiter, customPause = '', customResume = ''): WarningMarkers {
  if (delimiter === 'custom') return { pause: customPause, resume: customResume };
  const close = CLOSERS[delimiter];
  return { pause: `${delimiter}PARAGRAPH INTEGRITY PAUSES${close}`, resume: `${delimiter}PARAGRAPH INTEGRITY RESUMES${close}` };
}

// The mode the settings toggles pick by default (CardMirror's F3 branches).
export function defaultMode(paragraphIntegrity: boolean, usePilcrows: boolean): CondenseMode {
  return paragraphIntegrity ? 'integrity' : usePilcrows ? 'pilcrow' : 'merge';
}

// Returns the body text plus any marker lines that must stay full size and
// unmarked (the warning lines are notes to the reader, not cut text).
export function condenseParagraphs(paragraphs: string[], mode: CondenseMode, markers?: WarningMarkers): { text: string; markers: string[] } {
  const cleaned = paragraphs.map(cleanParagraph).filter(Boolean);
  if (mode === 'integrity') return { text: cleaned.join('\n\n'), markers: [] };
  if (mode === 'merge') return { text: cleaned.join(' '), markers: [] };
  if (mode === 'pilcrow') return { text: cleaned.join(PILCROW), markers: [] };
  const m = markers ?? warningMarkers('[');
  const lines = [m.pause, cleaned.join(' '), m.resume].filter((l) => l.trim());
  return { text: lines.join('\n\n'), markers: [m.pause, m.resume].filter((l) => l.trim()) };
}
