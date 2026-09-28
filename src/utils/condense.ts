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
// CardMirror's heading-handling / paste / "condense with warning" options
// govern tags, cites and pasted text inside a Word-style editor; a card body
// here is only ever body paragraphs, so they don't apply.

export const PILCROW = '¶'; // U+00B6

export interface CondenseOptions {
  paragraphIntegrity: boolean;
  usePilcrows: boolean;
}

export function cleanParagraph(text: string): string {
  return text
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\t\r\n\v\f\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function condenseParagraphs(paragraphs: string[], opts: CondenseOptions): string {
  const cleaned = paragraphs.map(cleanParagraph).filter(Boolean);
  if (opts.paragraphIntegrity) return cleaned.join('\n\n');
  return cleaned.join(opts.usePilcrows ? PILCROW : ' ');
}
