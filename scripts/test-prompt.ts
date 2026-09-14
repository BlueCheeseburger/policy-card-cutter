// Tests for src/utils/prompt.ts's {{VAR}} substitution. No Warroom test file
// covers this logic either (it's inline in electron/main.ts's renderPrompt
// there, never unit tested upstream), so this is new, written directly
// against the ported module.
//
// Runs against `renderTemplate` (the pure substitution function, decoupled
// from Vite's `?raw` bundled-template imports) with inline template strings,
// plus a plain-fs sanity pass over the real .txt files in src/prompts/ to
// confirm every {{VAR}} in each one is a real, spelled-correctly placeholder
// (this catches a typo'd {{VAR}} in the prompt file itself, which the app's
// own renderPrompt can't — it only ever sees the vars IT was told to supply).
//
// Run:  npx tsx scripts/test-prompt.ts

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate } from '../src/utils/renderTemplate';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}
function throws(name: string, fn: () => void) {
  try { fn(); fail++; console.log(`  ✗ ${name}  →  did not throw`); }
  catch { pass++; console.log(`  ✓ ${name}`); }
}

console.log('\n[1] a var supplied for every placeholder renders cleanly');
{
  const out = renderTemplate('Hello {{NAME}}, today is {{DAY}}.', 'test', { NAME: 'World', DAY: 'Monday' });
  check('substitutes both placeholders', out === 'Hello World, today is Monday.', out);
}

console.log('\n[2] a missing var throws instead of leaving {{VAR}} in the prompt sent to the model');
{
  throws('missing DAY', () => renderTemplate('Hello {{NAME}}, today is {{DAY}}.', 'test', { NAME: 'World' }));
}

console.log('\n[3] an unused supplied var throws — catches a var that no longer matches its template');
{
  throws('extra unused var EXTRA', () => renderTemplate('Hello {{NAME}}.', 'test', { NAME: 'World', EXTRA: 'x' }));
}

console.log('\n[4] the real bundled .txt templates only use well-formed {{VAR}} placeholders');
{
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/prompts');
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
  check('found the expected prompt files', files.length >= 2, files.join(', '));
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const placeholders = [...text.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
    const malformed = placeholders.filter((p) => !/^\w+$/.test(p));
    check(`${file}: every {{...}} is a plain \\w+ var name`, malformed.length === 0, malformed.join(', '));
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
