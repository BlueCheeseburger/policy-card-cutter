// Loads a bundled .txt prompt template and substitutes {{VAR}} placeholders.
// Ported from Warroom's electron main.ts `renderPrompt` — throws if a
// placeholder has no matching var (a missing var is a bug, not something to
// silently ignore) and if a var was supplied but never used in the template.

import readSourceTemplate from '../prompts/cutter_read_source.txt?raw';
import emphasizeTemplate from '../prompts/cutter_emphasize.txt?raw';

const TEMPLATES: Record<string, string> = {
  cutter_read_source: readSourceTemplate,
  cutter_emphasize: emphasizeTemplate,
};

export function renderPrompt(name: keyof typeof TEMPLATES, vars: Record<string, string>): string {
  const template = TEMPLATES[name];
  if (template === undefined) throw new Error(`Unknown prompt template: ${name}`);

  const usedVars = new Set<string>();
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt "${name}" uses {{${key}}} with no matching value provided.`);
    usedVars.add(key);
    return vars[key];
  });

  for (const key of Object.keys(vars)) {
    if (!usedVars.has(key)) throw new Error(`Prompt "${name}" was given unused variable {{${key}}}.`);
  }
  return rendered;
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
