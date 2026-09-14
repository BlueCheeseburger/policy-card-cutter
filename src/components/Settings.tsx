import { useState } from 'react';
import type { AIProvider } from '../types';
import type { Settings as SettingsType } from '../providers/ai';
import { loadSettings, saveSettings } from '../providers/ai';

const PROVIDERS: { id: AIProvider; label: string; corsNote?: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'OpenAI', corsNote: "OpenAI's API blocks direct browser calls (no CORS) — this will likely fail without a backend proxy." },
  { id: 'grok', label: 'Grok (xAI)', corsNote: "xAI's API blocks direct browser calls (no CORS) — this will likely fail without a backend proxy." },
];

export default function Settings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SettingsType>(() => loadSettings());

  function update(patch: Partial<SettingsType>) {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  }
  function updateKey(provider: AIProvider, key: string) {
    const next = { ...s, apiKeys: { ...s.apiKeys, [provider]: key } };
    setS(next);
    saveSettings(next);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 24 }} onClick={onClose}>
      <div className="glass-elevated scroll-thin" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Settings</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Your API key is stored only in this browser's local storage and sent directly to your chosen
          provider — there is no backend server. Gemini and Anthropic support direct browser calls;
          OpenAI and Grok generally don't (see notes below).
        </p>

        <label className="label" style={{ display: 'block', marginBottom: 6 }}>AI provider</label>
        <select
          className="input"
          style={{ width: '100%', marginBottom: 14 }}
          value={s.provider}
          onChange={(e) => update({ provider: e.target.value as AIProvider })}
        >
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        {PROVIDERS.map((p) => (
          <div key={p.id} style={{ marginBottom: 14, display: s.provider === p.id ? 'block' : 'none' }}>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>{p.label} API key</label>
            <input
              type="password"
              className="input"
              style={{ width: '100%' }}
              placeholder={`Paste your ${p.label} API key`}
              value={s.apiKeys[p.id] ?? ''}
              onChange={(e) => updateKey(p.id, e.target.value)}
            />
            {p.corsNote && <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{p.corsNote}</p>}
          </div>
        ))}

        {s.provider !== 'gemini' && (
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>
              Gemini key for credential search <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="password"
              className="input"
              style={{ width: '100%' }}
              placeholder="Only used to look up author credentials via Google Search"
              value={s.auxGeminiKey ?? ''}
              onChange={(e) => update({ auxGeminiKey: e.target.value })}
            />
          </div>
        )}

        <div style={{ marginBottom: 4 }}>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>Current-year short cite</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              style={s.citeYearFormat !== 'year' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
              onClick={() => update({ citeYearFormat: 'month-day' })}
            >
              Month-day (Brady 3-15)
            </button>
            <button
              className="btn"
              style={s.citeYearFormat === 'year' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
              onClick={() => update({ citeYearFormat: 'year' })}
            >
              Two-digit year (Brady 26)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
