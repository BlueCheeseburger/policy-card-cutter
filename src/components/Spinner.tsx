import { useEffect, useState } from 'react';

// Cycles through a list of status messages every 2.2s while an AI call is in
// flight — ported from Warroom's Spinner.tsx LoadingState.
export function LoadingState({ messages, className }: { messages: string[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="spinner" style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid var(--border-med)', borderTopColor: 'var(--accent)',
        animation: 'pcc-spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center' }}>{messages[idx]}</p>
      <style>{'@keyframes pcc-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
