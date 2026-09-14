// Loads a bundled .txt prompt template and substitutes {{VAR}} placeholders.
// Ported from Warroom's electron main.ts `renderPrompt` — throws if a
// placeholder has no matching var (a missing var is a bug, not something to
// silently ignore) and if a var was supplied but never used in the template.

import readSourceTemplate from '../prompts/cutter_read_source.txt?raw';
import emphasizeTemplate from '../prompts/cutter_emphasize.txt?raw';
import { renderTemplate } from './renderTemplate';

const TEMPLATES: Record<string, string> = {
  cutter_read_source: readSourceTemplate,
  cutter_emphasize: emphasizeTemplate,
};

export const PROMPT_NAMES = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];

// The bundled, as-shipped template text — used by the Settings prompt editor
// to show what "Reset to default" would restore.
export function getBundledPromptTemplate(name: keyof typeof TEMPLATES): string {
  const template = TEMPLATES[name];
  if (template === undefined) throw new Error(`Unknown prompt template: ${name}`);
  return template;
}

// `overrideTemplate`, when given, replaces the bundled .txt file entirely —
// this is how a Settings-page edit of a prompt takes effect. Callers resolve
// the override themselves (platform/ai.ts, from Settings) so this module
// stays pure/DOM-only, with no dependency on platform/settings.ts.
export function renderPrompt(name: keyof typeof TEMPLATES, vars: Record<string, string>, overrideTemplate?: string): string {
  const template = overrideTemplate ?? TEMPLATES[name];
  if (template === undefined) throw new Error(`Unknown prompt template: ${name}`);
  return renderTemplate(template, name, vars);
}

// Cap a piece of text before it goes into a prompt, and ask before dropping
// anything — mirrors Warroom's capForPrompt (which shows a confirm dialog via
// IPC); here a plain browser confirm() serves the same "ask before silently
// truncating" purpose.
const TRUNCATION_DECLINED = 'Cancelled — the input was too long to send in full and you chose not to send a shortened version.';

export function capForPrompt(text: string, limit: number, label: string): string {
  const s = String(text ?? '');
  if (s.length <= limit) return s;
  const proceed = window.confirm(
    `${label} is ${s.length.toLocaleString()} characters — only the first ${limit.toLocaleString()} can be sent in one call. Send a shortened version?`,
  );
  if (!proceed) throw new Error(TRUNCATION_DECLINED);
  return s.slice(0, limit);
}
