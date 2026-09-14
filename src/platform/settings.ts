// App settings (AI provider + key, cite-year format) persisted to localStorage.
//
// This is genuinely new surface, not a preserved Warroom contract: Warroom's
// CardCutter.tsx never called `window.warroom.storage.*` itself — only
// electron/main.ts's IPC handlers read `app_settings` internally, and API
// keys lived behind `safeStorage` (OS-level encryption), reachable only from
// the main process. Neither has a browser equivalent, so this module doesn't
// pretend to shim either one; see the README's "API keys aren't protected"
// section for what that means for the user.

import type { AIProvider, HighlightColor } from '../types';
import type { HighlightLevel } from '../utils/cardFormat';

const KEY = 'pcc:settings';

export type PromptName = 'cutter_read_source' | 'cutter_emphasize';

export interface Settings {
  provider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
  // Optional aux Gemini key used only for Google Search grounding (author
  // credential lookups) when the main provider isn't Gemini.
  auxGeminiKey?: string;
  // Current-year short-cite style: "Brady 3-15" (month-day) vs "Brady 26" (year).
  citeYearFormat?: 'month-day' | 'year';
  // Seeds a new cut's color/density pickers; each cut can still change them.
  defaultHighlightColor?: HighlightColor;
  defaultHighlightLevel?: HighlightLevel;
  // A user edit of a bundled prompt, keyed by template name. Read/rendered in
  // place of the bundled .txt file when present — see utils/prompt.ts.
  promptOverrides?: Partial<Record<PromptName, string>>;
}

const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  apiKeys: {},
  defaultHighlightColor: 'cyan',
  defaultHighlightLevel: 2,
};

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, apiKeys: { ...parsed.apiKeys } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function aiConfigured(): boolean {
  const s = readSettings();
  return !!s.apiKeys[s.provider];
}

export function clearAll(): void {
  localStorage.removeItem(KEY);
}
