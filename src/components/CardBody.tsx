import type { CardRun, CardImage } from '../types';
import { HIGHLIGHT_CSS, FONT_SIZE_EM } from '../utils/cardFormat';

// Renders a formatted card body (underline / highlight / font-size) read-only.
// Highlight text is always rendered in black so it stays legible against a
// full-saturation highlight background in both light and dark mode.
export function FormattedBody({ runs, className }: { runs: CardRun[]; className?: string }) {
  return (
    <div className={`card-body-text ${className ?? ''}`}>
      {runs.map((r, i) => {
        const style: React.CSSProperties = {};
        if (r.highlight) {
          style.backgroundColor = HIGHLIGHT_CSS[r.highlight];
          style.color = '#000';
        }
        if (r.underline) style.textDecoration = 'underline';
        // Matches Verbatim's "Emphasis" character style: a single-line border
        // around the single most essential word/phrase, on top of underline
        // and highlight — see CardRun.box's doc comment.
        if (r.box) { style.border = '1.5px solid currentColor'; style.padding = '0 1px'; }
        if (r.fontSize && r.fontSize < 11) {
          style.fontSize = FONT_SIZE_EM[r.fontSize];
          style.opacity = 0.6;
        }
        return <span key={i} style={style}>{r.text}</span>;
      })}
    </div>
  );
}

// Thumbnails for images attached to a card.
export function CardImages({ images, className }: { images: CardImage[]; className?: string }) {
  if (!images?.length) return null;
  return (
    <div className={`card-images ${className ?? ''}`}>
      {images.map((img, i) => (
        <img key={i} src={img.src} alt={img.alt || ''} title={img.alt || ''} className="card-image-thumb" />
      ))}
    </div>
  );
}
