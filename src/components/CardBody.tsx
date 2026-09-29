import type { Card, CardRun } from '../types';
import { HIGHLIGHT_CSS, FONT_SIZE_EM, parseTagRuns } from '../utils/cardFormat';

// The whole cut card — tag, cite, body — as one read-only page, styled like
// the exported Verbatim .docx: white paper and black text in every theme,
// Times New Roman, 13pt bold tag, bold short cite. Small text is shrunk but
// stays black, same as in Word.
export function CardView({ card }: { card: Pick<Card, 'tag' | 'cite' | 'bodyRuns'> }) {
  const dashIdx = card.cite.indexOf(' — ');
  const citeShort = dashIdx >= 0 ? card.cite.slice(0, dashIdx) : card.cite;
  const citeRest = dashIdx >= 0 ? card.cite.slice(dashIdx) : '';
  return (
    <div className="card-page">
      <p style={{ fontSize: '13pt', fontWeight: 700, margin: '0 0 2px' }}>
        {parseTagRuns(card.tag).map((r, i) => (
          <span key={i} style={r.underline ? { textDecoration: 'underline' } : undefined}>{r.text}</span>
        ))}
      </p>
      <p style={{ margin: '0 0 8px' }}>
        <span style={{ fontSize: '13pt', fontWeight: 700 }}>{citeShort}</span>{citeRest}
      </p>
      <FormattedBody runs={card.bodyRuns} />
    </div>
  );
}

function FormattedBody({ runs }: { runs: CardRun[] }) {
  return (
    <p style={{ margin: 0 }}>
      {runs.map((r, i) => {
        const style: React.CSSProperties = {};
        if (r.highlight) style.backgroundColor = HIGHLIGHT_CSS[r.highlight];
        if (r.underline) style.textDecoration = 'underline';
        // Verbatim's "Emphasis" character style: a single-line border. Boxed
        // text is also bold.
        if (r.box) { style.border = '1px solid #000'; style.padding = '0 1px'; style.fontWeight = 700; }
        if (r.fontSize && r.fontSize < 11) style.fontSize = FONT_SIZE_EM[r.fontSize];
        return <span key={i} style={style}>{r.text}</span>;
      })}
    </p>
  );
}
