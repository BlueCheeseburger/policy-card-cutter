// Exports a cut card to a .docx file matching Verbatim-style formatting
// (bold heading tag, underline = read-aloud, highlight color, small text for
// shrunk context) — the same run shape Warroom's own docx export understands.

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import type { Card, HighlightColor } from '../types';

const HIGHLIGHT_TO_DOCX: Record<HighlightColor, 'yellow' | 'cyan' | 'green'> = {
  yellow: 'yellow',
  cyan: 'cyan',
  green: 'green',
};

export async function exportCardToDocx(card: Card): Promise<Blob> {
  const bodyRuns = card.bodyRuns.map((r) => new TextRun({
    text: r.text,
    underline: r.underline ? {} : undefined,
    highlight: r.highlight ? HIGHLIGHT_TO_DOCX[r.highlight] : undefined,
    size: (r.fontSize ?? 11) * 2, // half-points; 11pt body default
  }));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: card.tag, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: card.cite, italics: true, size: 18 })] }),
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
