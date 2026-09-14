import { useState } from 'react';
import type { AIQuestion } from '../types';

// Shared UI for the AI-clarifying-question contract: a one-shot AI call can
// pause instead of guessing at genuine ambiguity, returning a short question
// with a few concrete options plus a free-text "Other". Ported from Warroom's
// AIQuestionPrompt.tsx.
export default function AIQuestionPrompt({
  question, onAnswer, busy,
}: {
  question: AIQuestion;
  onAnswer: (answer: string) => void;
  busy?: boolean;
}) {
  const [other, setOther] = useState('');
  const [showOther, setShowOther] = useState(false);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }} aria-hidden>❓</span>
        <p style={{ fontSize: 14, flex: 1, margin: 0 }}>{question.question}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 24, marginTop: 10 }}>
        {question.options.map((opt) => (
          <button key={opt} className="btn" style={{ fontSize: 12 }} disabled={busy} onClick={() => onAnswer(opt)}>
            {opt}
          </button>
        ))}
        {!showOther && (
          <button className="btn" style={{ fontSize: 12, color: 'var(--ink-muted)' }} disabled={busy} onClick={() => setShowOther(true)}>
            Other…
          </button>
        )}
      </div>
      {showOther && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 24, marginTop: 8 }}>
          <input
            autoFocus
            className="input"
            style={{ fontSize: 12, flex: 1, maxWidth: 280 }}
            placeholder="Type your answer…"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && other.trim()) onAnswer(other.trim()); }}
            disabled={busy}
          />
          <button className="btn-primary" style={{ fontSize: 12 }} disabled={busy || !other.trim()} onClick={() => onAnswer(other.trim())}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
