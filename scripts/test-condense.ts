// Tests src/utils/condense.ts against the rules CardMirror's condense uses
// (spec supplied by that project's session). Non-ASCII characters are built
// with String.fromCharCode so this file stays plain ASCII.
//
// Run:  npx tsx scripts/test-condense.ts

import { condenseParagraphs, cleanParagraph, defaultMode, warningMarkers, PILCROW } from '../src/utils/condense';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}
const ch = String.fromCharCode;
const text = (paras: string[], mode: Parameters<typeof condenseParagraphs>[1]) => condenseParagraphs(paras, mode).text;

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
  const out = text(['The\tfed  raises', '', 'rates.'], 'integrity');
  check('cleaned, empty removed, still two paragraphs', out === 'The fed raises\n\nrates.', JSON.stringify(out));
}

console.log('\n[3] Branch A — condensed: merged with one space');
check('A. B.', text(['A.', 'B.'], 'merge') === 'A. B.');

console.log('\n[4] Branch B — condensed with pilcrows: joined by the pilcrow');
{
  check('A.¶B.', text(['A.', 'B.'], 'pilcrow') === 'A.' + PILCROW + 'B.');
  check('pilcrow is U+00B6', PILCROW === ch(0xb6));
}

console.log('\n[5] settings toggles pick the default mode like CardMirror\'s F3');
{
  check('integrity on -> paragraphs kept (pilcrow setting ignored)', defaultMode(true, false) === 'integrity' && defaultMode(true, true) === 'integrity');
  check('integrity off + pilcrows -> pilcrow', defaultMode(false, true) === 'pilcrow');
  check('integrity off, no pilcrows -> merge', defaultMode(false, false) === 'merge');
}

console.log('\n[6] Condense With Warning wraps the merged body in pause/resume lines');
{
  const r = condenseParagraphs(['A.', 'B.'], 'warning', warningMarkers('['));
  check('default brackets', r.text === '[PARAGRAPH INTEGRITY PAUSES]\n\nA. B.\n\n[PARAGRAPH INTEGRITY RESUMES]', JSON.stringify(r.text));
  check('marker lines reported so they stay full size', r.markers.length === 2);
  check('[[ delimiter closes with ]]', warningMarkers('[[').resume === '[[PARAGRAPH INTEGRITY RESUMES]]');
  check('< delimiter closes with >', warningMarkers('<').pause === '<PARAGRAPH INTEGRITY PAUSES>');
  check('{{ delimiter closes with }}', warningMarkers('{{').pause === '{{PARAGRAPH INTEGRITY PAUSES}}');
  const c = condenseParagraphs(['A.'], 'warning', warningMarkers('custom', 'STOP', 'GO'));
  check('custom uses its own pause and resume text', c.text === 'STOP\n\nA.\n\nGO', JSON.stringify(c.text));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
