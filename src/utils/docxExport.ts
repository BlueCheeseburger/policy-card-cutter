// Exports a cut card to a .docx matching the real Verbatim template's styles
// exactly — verified against two actual cut cards' underlying XML
// (styles.xml's Heading4/"Tag", Style13ptBold/"Cite", StyleUnderline
// /"Underline", and Emphasis character styles), not just approximated:
//
// - Whole document: Times New Roman, 11pt (docDefaults: rFonts Times New
//   Roman, sz 22 half-points) — every run below sets both explicitly rather
//   than relying on the docx library's own defaults (Calibri, different size).
// - Tagline: bold, 13pt (sz 26) — Heading4's real rPr, aliased "Tag". Parts
//   marked `_..._` in the tag string are underlined.
// - Cite: only the short-cite prefix before the first " — " is bold + 13pt
//   (Style13ptBold, aliased "Cite"); the rest of the cite is plain 11pt —
//   confirmed in both sample cards ("Hirsh 25" / "Horovitz & Süß 25" bold,
//   everything after plain).
// - Underline (StyleUnderline): 11pt, not bold, single underline, no border.
// - Highlight: underline + highlight color, no border — same as underline
//   above but with `w:highlight` added.
// - Box/emphasis (the real "Emphasis" style): underline + highlight + a
//   single-line auto-color border (`w:bdr`), not italic. The sample cards'
//   Emphasis style sets bold off, but the user's rule is "anything boxed is
//   bolded", so boxed runs are also bold here.
// - Every run gets explicit black color (`000000`) — the template does this
//   on every single run, not just the ones that might otherwise inherit a
//   theme color.
//
// The "Analytic" style seen at the top of a real saved card (a coach's/
// debater's own written note, stripped before a card ever reaches this
// export) has no bearing on a cut card's own styling and is deliberately
// not reproduced here.

import { Document, Packer, Paragraph, TextRun, BorderStyle } from 'docx';
import type { Card, HighlightColor } from '../types';
import { parseTagRuns } from './cardFormat';

const FONT = 'Times New Roman';
const BLACK = '000000';

const HIGHLIGHT_TO_DOCX: Record<HighlightColor, 'yellow' | 'cyan' | 'green'> = {
  yellow: 'yellow',
  cyan: 'cyan',
  green: 'green',
};

// `<w:bdr w:val="single" w:sz="8" w:space="0" w:color="auto"/>` from the real
// "Emphasis" character style.
const BOX_BORDER = { style: BorderStyle.SINGLE, size: 8, space: 0, color: 'auto' };

export async function exportCardToDocx(card: Card): Promise<Blob> {
  const tagRuns = parseTagRuns(card.tag).map((r) => new TextRun({
    text: r.text, font: FONT, color: BLACK, bold: true, size: 26, underline: r.underline ? {} : undefined,
  }));

  // Only the short-cite prefix ("Lastname YY" / "Lastname M-D") is bold+13pt;
  // everything from the " — " separator onward (including the dash) is
  // plain 11pt, matching both real cards' cite runs exactly.
  const dashIdx = card.cite.indexOf(' — ');
  const citeShort = dashIdx >= 0 ? card.cite.slice(0, dashIdx) : card.cite;
  const citeRest = dashIdx >= 0 ? card.cite.slice(dashIdx) : '';
  const citeRuns = [
    new TextRun({ text: citeShort, font: FONT, color: BLACK, bold: true, size: 26 }),
    ...(citeRest ? [new TextRun({ text: citeRest, font: FONT, color: BLACK, size: 22 })] : []),
  ];

  // Word treats a raw "\n" inside a run as a space, so paragraph breaks in the
  // body (the on-screen card shows them) become explicit line breaks.
  const bodyRuns = card.bodyRuns.flatMap((r) => r.text.split('\n').map((piece, i) => new TextRun({
    text: piece,
    break: i > 0 ? 1 : undefined,
    font: FONT,
    color: BLACK,
    bold: r.box ? true : undefined,
    underline: r.underline ? {} : undefined,
    highlight: r.highlight ? HIGHLIGHT_TO_DOCX[r.highlight] : undefined,
    border: r.box ? BOX_BORDER : undefined,
    size: (r.fontSize ?? 11) * 2, // half-points; 11pt body default
  })));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ spacing: { before: 200 }, children: tagRuns }),
        new Paragraph({ children: citeRuns }),
        new Paragraph({ children: bodyRuns }),
      ],
    }],
  });

  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
