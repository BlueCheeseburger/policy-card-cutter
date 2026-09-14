// Pure {{VAR}} substitution, split out from prompt.ts so it has zero
// Vite-specific imports (prompt.ts's `?raw` template imports fail outside
// Vite's asset pipeline) and can be unit-tested directly in plain Node —
// see scripts/test-prompt.ts.
export function renderTemplate(template: string, label: string, vars: Record<string, string>): string {
  const usedVars = new Set<string>();
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt "${label}" uses {{${key}}} with no matching value provided.`);
    usedVars.add(key);
    return vars[key];
  });

  for (const key of Object.keys(vars)) {
    if (!usedVars.has(key)) throw new Error(`Prompt "${label}" was given unused variable {{${key}}}.`);
  }
  return rendered;
}
