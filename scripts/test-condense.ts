// Tests src/utils/condense.ts against the rules CardMirror's condense uses
// (spec supplied by that project's session). Non-ASCII characters are built
// with String.fromCharCode so this file stays plain ASCII.
//
// Run:  npx tsx scripts/test-condense.ts

import { condenseParagraphs, cleanParagraph, PILCROW } from '../src/utils/condense';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}
const ch = String.fromCharCode;
const integrity = { paragraphIntegrity: true, usePilcrows: true };
const merge = { paragraphIntegrity: false, usePilcrows: false };
const pilcrow = { paragraphIntegrity: false, usePilcrows: true };

console.log('\n[1] whitespace cleanup');
{
  check('tabs and runs of spaces collapse to one space', cleanParagraph('The\tfed  raises') === 'The fed raises');
  check('NBSP and Unicode spaces become spaces', cleanParagraph(`a${ch(0xa0)}b${ch(0x2003)}c`) === 'a b c');
  check('in-text line breaks become a space', cleanParagraph('a\nb\r\nc') === 'a b c');
  check('soft hyphen and zero-width chars are deleted', cleanParagraph(`in${ch(0xad)}fla${ch(0x200b)}tion`) === 'inflation');
  check('leading and trailing spaces are stripped', cleanParagraph('  hi  ') === 'hi');
}

console.log('\n[2] Branch C — integrity on: paragraphs stay separate, empties dropped');
{
  const out = condenseParagraphs(['The\tfed  raises', '', 'rates.'], integrity);
  check('cleaned, empty removed, still two paragraphs', out === 'The fed raises\n\nrates.', JSON.stringify(out));
}

console.log('\n[3] Branch A — integrity off, no pilcrows: merged with one space');
{
  check('A. B.', condenseParagraphs(['A.', 'B.'], merge) === 'A. B.');
  check('pilcrow setting ignored while integrity is on', condenseParagraphs(['A.', 'B.'], { paragraphIntegrity: true, usePilcrows: false }) === 'A.\n\nB.');
}

console.log('\n[4] Branch B — integrity off, pilcrows: joined by the pilcrow');
{
  check('A.¶B.', condenseParagraphs(['A.', 'B.'], pilcrow) === 'A.' + PILCROW + 'B.');
  check('pilcrow is U+00B6', PILCROW === ch(0xb6));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
