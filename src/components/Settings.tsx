import React, { useState } from 'react';
import type { AIProvider, HighlightColor } from '../types';
import type { HighlightLevel } from '../utils/cardFormat';
import { HIGHLIGHT_SWATCH } from '../utils/cardFormat';
import type { Settings as SettingsType } from '../platform/settings';
import { readSettings, writeSettings, clearAll } from '../platform/settings';
import {
  promptNames, promptSource, isPromptOverridden, savePromptOverride, resetPromptOverride,
} from '../platform/ai';

// A full page (not a modal) — same structural pattern as policy-flow's own
// Settings.tsx: a scrollable column of bordered "card" sections, each with a
// label header, ending in a danger section. Adapted to this app's plain-CSS
// styling instead of policy-flow's Tailwind classes.
const PROVIDERS: { id: AIProvider; label: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'lmstudio', label: 'LM Studio' },
];

const COLORS: HighlightColor[] = ['yellow', 'cyan', 'green'];
const LEVELS: { value: HighlightLevel; label: string }[] = [
  { value: 1, label: 'Less' }, { value: 2, label: 'Medium' }, { value: 3, label: 'More' },
];

export default function Settings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SettingsType>(() => readSettings());
  const [showKey, setShowKey] = useState(false);

  function update(patch: Partial<SettingsType>) {
    setS(writeSettings(patch));
  }
  function updateKey(provider: 'gemini' | 'anthropic', key: string) {
    setS(writeSettings({ apiKeys: { ...s.apiKeys, [provider]: key } }));
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }} className="scroll-thin">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 600, margin: 0 }}>Settings</h1>
          <button className="btn" onClick={onClose}>Done</button>
        </header>

        <Section
          title="AI"
          intro={
            s.provider === 'lmstudio'
              ? (s.lmStudioUrl.trim() ? `LM Studio · ${s.lmStudioUrl}` : 'No server address set — nothing here works yet')
              : (s.apiKeys[s.provider] ? `${PROVIDERS.find((p) => p.id === s.provider)?.label} · key set` : 'No key set — nothing here works yet')
          }
        >
          <Row label="Provider">
            <Segmented value={s.provider} onChange={(v) => update({ provider: v as AIProvider })}
              options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
          </Row>

          {s.provider === 'lmstudio' ? (
            <>
              <Row label="Server address">
                <input
                  className="input" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  spellCheck={false}
                  placeholder="http://localhost:1234"
                  value={s.lmStudioUrl}
                  onChange={(e) => update({ lmStudioUrl: e.target.value })}
                />
              </Row>
              <Row label="Model" hint="Whatever model is currently loaded in LM Studio.">
                <input
                  className="input" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  spellCheck={false}
                  placeholder="local-model"
                  value={s.lmStudioModel}
                  onChange={(e) => update({ lmStudioModel: e.target.value })}
                />
              </Row>
              <Callout>
                LM Studio runs on your own machine, so nothing leaves it. Two catches: turn on{' '}
                <strong style={{ color: 'var(--ink)' }}>CORS</strong> in LM Studio's server settings, and use
                Chrome, Edge, or Firefox — Safari blocks a page like this one from reaching{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>localhost</code> at all.
              </Callout>
            </>
          ) : (
            <>
              <Row label="API key">
                <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                  <KeyInput
                    revealed={showKey}
                    placeholder={`Paste your ${PROVIDERS.find((p) => p.id === s.provider)?.label} API key`}
                    value={s.apiKeys[s.provider as 'gemini' | 'anthropic'] ?? ''}
                    onChange={(v) => updateKey(s.provider as 'gemini' | 'anthropic', v)}
                  />
                  <button className="btn" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
                </div>
              </Row>
              <Row label="Model">
                <input
                  className="input" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  spellCheck={false}
                  placeholder={s.provider === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-5'}
                  value={s.provider === 'gemini' ? s.geminiModel : s.anthropicModel}
                  onChange={(e) => update(s.provider === 'gemini' ? { geminiModel: e.target.value } : { anthropicModel: e.target.value })}
                />
              </Row>
              <Callout>
                <strong style={{ color: 'var(--ink)' }}>An API key here is not protected.</strong> It sits in
                browser storage because a page with no accounts has nowhere better to put it, and
                anything running in this origin can read it. On a shared computer, be careful.
              </Callout>
            </>
          )}

          {s.provider !== 'gemini' && (
            <Row label="Gemini key" hint="Optional — only used for Google Search author-credential lookups">
              <KeyInput
                revealed={false}
                placeholder="Only used to look up author credentials via Google Search"
                value={s.auxGeminiKey ?? ''}
                onChange={(v) => update({ auxGeminiKey: v })}
              />
            </Row>
          )}

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 className="label" style={{ margin: 0 }}>Prompts</h3>
            <p style={{ fontSize: 13, margin: 0 }}>Exactly what gets sent to the model for reading a source and cutting a card. Read them, or edit and save your own version.</p>
            <PromptEditor />
          </div>
        </Section>

        <Section title="Card cutting">
          <Row label="Current-year short cite">
            <Segmented
              value={s.citeYearFormat ?? 'month-day'}
              onChange={(v) => update({ citeYearFormat: v as 'month-day' | 'year' })}
              options={[{ value: 'month-day', label: 'Brady 3-15' }, { value: 'year', label: 'Brady 26' }]}
            />
          </Row>
          <Row label="Default highlight color" hint="Seeds the color picker for a new cut; you can still change it per card.">
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => update({ defaultHighlightColor: c })}
                  title={c}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                    border: `2px solid ${(s.defaultHighlightColor ?? 'cyan') === c ? 'var(--ink)' : 'transparent'}`,
                    backgroundColor: HIGHLIGHT_SWATCH[c],
                  }}
                />
              ))}
            </div>
          </Row>
          <Row label="Default highlight density" hint="Seeds the Less/Medium/More slider for a new cut.">
            <Segmented
              value={String(s.defaultHighlightLevel ?? 2)}
              onChange={(v) => update({ defaultHighlightLevel: Number(v) as HighlightLevel })}
              options={LEVELS.map((l) => ({ value: String(l.value), label: l.label }))}
            />
          </Row>
        </Section>

        <Section title="Clear local data" danger>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Erases your API keys, provider choice, prompt edits, and every other preference stored
            in this browser. There are no cards or accounts to lose — a card only ever lives until
            you close its tab.
          </p>
          <button
            className="btn"
            style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)', alignSelf: 'flex-start' }}
            onClick={() => {
              if (!window.confirm('Erase all settings stored in this browser?')) return;
              clearAll();
              window.location.reload();
            }}
          >
            Clear local data
          </button>
        </Section>
      </div>
    </div>
  );
}

function PromptEditor() {
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [, bump] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {promptNames().map((name, i) => {
        const isOpen = open === name;
        const overridden = isPromptOverridden(name);
        const saved = promptSource(name);
        const draft = drafts[name] ?? saved;
        const dirty = draft !== saved;
        return (
          <div key={name} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined, paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
            <button
              className="btn"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', boxShadow: 'none', padding: '6px 0' }}
              onClick={() => setOpen(isOpen ? null : name)}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {name}{overridden && <span style={{ color: 'var(--accent)' }}> · edited</span>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{isOpen ? 'Hide' : 'Edit'}</span>
            </button>
            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <textarea
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, minHeight: 240, resize: 'vertical' }}
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-primary"
                    disabled={!dirty}
                    title={dirty ? undefined : 'No changes to save'}
                    onClick={() => { savePromptOverride(name, draft); bump((n) => n + 1); }}
                  >
                    Save
                  </button>
                  <button
                    className="btn"
                    disabled={!overridden}
                    onClick={() => { resetPromptOverride(name); setDrafts((d) => ({ ...d, [name]: promptSource(name) })); bump((n) => n + 1); }}
                    title="Restore the bundled default text"
                  >
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, intro, danger, children }: {
  title: string; intro?: string; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <section
      className="card"
      style={{
        padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
        borderColor: danger ? 'color-mix(in srgb, var(--danger) 28%, transparent)' : undefined,
      }}
    >
      <h2 className="label" style={{ margin: 0, ...(danger ? { color: 'var(--danger)' } : {}) }}>{title}</h2>
      {intro && <p style={{ fontSize: 13, margin: '-8px 0 0' }}>{intro}</p>}
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 16, fontSize: 13 }}>
      <span style={{ width: 136, flexShrink: 0, paddingTop: 6 }}>
        <span style={{ display: 'block', color: 'var(--ink-muted)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', padding: 2, gap: 2, background: 'var(--bg-btn)' }} role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value} role="radio" aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: active ? 'var(--bg-elevated)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-muted)',
              boxShadow: active ? 'var(--shadow-btn)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A masked text field for API keys that never triggers Chrome's (or any
// browser's) "Save password?" prompt. Real `type="password"` inputs get that
// prompt unconditionally — `autocomplete="off"` is deliberately ignored on
// them by every major browser, specifically so a page can't opt itself out
// of the password manager. The fix is to never use a real password field:
// this renders `type="text"` and masks the characters with the CSS property
// `-webkit-text-security` instead, which looks identical but isn't a field
// browsers' credential heuristics recognize at all. Firefox doesn't support
// that CSS property and shows the key in plain text; every Chromium browser
// (Chrome, Edge, Arc, Brave, Opera) and Safari do.
function KeyInput({ value, onChange, placeholder, revealed }: {
  value: string; onChange: (v: string) => void; placeholder?: string; revealed: boolean;
}) {
  return (
    <input
      className="input"
      style={{
        flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12,
        WebkitTextSecurity: revealed ? 'none' : 'disc',
      } as React.CSSProperties}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      // Extra opt-outs some password managers respect even though Chrome
      // itself ignores autocomplete="off" — harmless to include regardless.
      data-lpignore="true"
      data-1p-ignore=""
      data-bwignore="true"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--ink-muted)',
      background: 'var(--bg-btn)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
    }}>
      <span aria-hidden style={{ flexShrink: 0 }}>⚠</span>
      <span>{children}</span>
    </div>
  );
}
