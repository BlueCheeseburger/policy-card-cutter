// Runs every scripts/test-*.ts as its own process and reports a pass/fail
// summary. Mirrors policy-flow's test-all.ts (itself modeled on how this kind
// of thing is done): each test file ends in its own process.exit(), so a
// spawnSync per file keeps one test's crash from taking down the rest of the
// run.
//
// Run:  npm test

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.startsWith('test-') && f.endsWith('.ts') && f !== 'test-all.ts')
  .sort();

let allPassed = true;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const res = spawnSync('npx', ['tsx', join(dir, file)], { stdio: 'inherit' });
  if (res.status !== 0) allPassed = false;
}

console.log(`\n${allPassed ? 'All test files passed.' : 'Some test files FAILED — see above.'}`);
process.exit(allPassed ? 0 : 1);
