// Verifies exportCardToDocx's output XML against the real Verbatim styles
// found in two actual cut cards' underlying .docx ('Sample Cards 1.docx' and
// a Golden Dome card from a real speech doc) — not just eyeballed once.
// New styling regressions (wrong size, missing border, bold leaking into
// the wrong run, etc.) show up here as a failing check instead of a silently
// wrong exported file.
//
// Run:  npx tsx scripts/test-docx-export.ts

import JSZip from 'jszip';
import { exportCardToDocx } from '../src/utils/docxExport';
import type { Card } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}

async function documentXml(card: Card): Promise<string> {
  const blob = await exportCardToDocx(card);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml missing from exported .docx');
  return file.async('string');
}

// Pulls the <w:rPr>...</w:rPr> block for the <w:t> run whose content matches
// the given text — an exact whole-run match (bounded by `>text<`) if one
// exists (this disambiguates a short word like "Trump" from a longer run
// that merely starts with it, e.g. a tagline beginning "Trump cheats..."),
// otherwise the first run whose content starts with it.
function rPrBefore(xml: string, text: string): string {
  const exactIdx = xml.indexOf(`>${text}<`);
  const tIdx = exactIdx !== -1 ? exactIdx : xml.indexOf(`>${text}`);
  if (tIdx === -1) throw new Error(`text not found in exported XML: "${text}"`);
  const runStart = xml.lastIndexOf('<w:r>', tIdx);
  const rPrMatch = xml.slice(runStart, tIdx).match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  return rPrMatch ? rPrMatch[1] : '';
}

const card: Card = {
  id: 'test',
  tag: 'Trump cheats through multiple pathways',
  cite: 'Rather 2-5 — Dan Rather. 2026. American journalist, commentator, and former national evening news anchor. Steady, "If You Can\'t Beat \'Em, Cheat," https://steady.substack.com/p/if-you-cant-beat-em-cheat',
  body: 'Trump has known for some time that Republican prospects are bleak.',
  bodyRuns: [
    { text: 'Trump', underline: true, highlight: 'cyan', box: true },
    { text: ' has ', underline: true },
    { text: 'known', underline: true, highlight: 'cyan' },
    { text: ' for some time that Republican prospects are ', fontSize: 8 },
    { text: 'bleak', underline: true, highlight: 'cyan', box: true },
    { text: '.', underline: true },
  ],
  year: 2026,
  createdAt: new Date().toISOString(),
};

const xml = await documentXml(card);

console.log('\n[1] every run is Times New Roman and explicit black — matches docDefaults + every real run\'s color override');
{
  const runCount = (xml.match(/<w:r>/g) || []).length;
  const timesNewRomanCount = (xml.match(/Times New Roman/g) || []).length;
  const blackCount = (xml.match(/w:color w:val="000000"/g) || []).length;
  check('at least one run of each kind rendered', runCount >= 6, `${runCount} runs`);
  check('every run specifies Times New Roman', timesNewRomanCount >= runCount, `${timesNewRomanCount} Times New Roman refs for ${runCount} runs`);
  check('every run specifies explicit black', blackCount >= runCount, `${blackCount} black refs for ${runCount} runs`);
}

console.log('\n[2] tagline is bold, 13pt (sz 26) — matches Heading4/"Tag" real rPr');
{
  const rPr = rPrBefore(xml, 'Trump cheats through multiple pathways');
  check('bold', /<w:b\/>/.test(rPr), rPr);
  check('13pt (sz 26)', /<w:sz w:val="26"\/>/.test(rPr), rPr);
}

console.log('\n[3] cite: only the short-cite prefix is bold+13pt, the rest is plain 11pt — matches both real cards');
{
  const shortRPr = rPrBefore(xml, 'Rather 2-5');
  check('short cite is bold', /<w:b\/>/.test(shortRPr), shortRPr);
  check('short cite is 13pt (sz 26)', /<w:sz w:val="26"\/>/.test(shortRPr), shortRPr);
  const restRPr = rPrBefore(xml, ' — Dan Rather. 2026.');
  check('rest of cite is NOT bold', !/<w:b\/>/.test(restRPr), restRPr);
  check('rest of cite is 11pt (sz 22)', /<w:sz w:val="22"\/>/.test(restRPr), restRPr);
}

console.log('\n[4] underline-only run: 11pt, single underline, no highlight, no border — matches StyleUnderline');
{
  const rPr = rPrBefore(xml, ' has ');
  check('underlined', /<w:u w:val="single"/.test(rPr), rPr);
  check('11pt (sz 22)', /<w:sz w:val="22"\/>/.test(rPr), rPr);
  check('not bold', !/<w:b\/>/.test(rPr), rPr);
  check('no highlight', !/<w:highlight/.test(rPr), rPr);
  check('no border', !/<w:bdr/.test(rPr), rPr);
}

console.log('\n[5] highlighted (not boxed) run: underline + highlight, no border');
{
  const rPr = rPrBefore(xml, 'known');
  check('underlined', /<w:u w:val="single"/.test(rPr), rPr);
  check('highlighted cyan', /<w:highlight w:val="cyan"/.test(rPr), rPr);
  check('no border (highlight alone never gets one)', !/<w:bdr/.test(rPr), rPr);
}

console.log('\n[6] small/context run: shrunk to 8pt (sz 16), no underline, no highlight — matches real small-text runs');
{
  const rPr = rPrBefore(xml, ' for some time that Republican prospects are ');
  check('8pt (sz 16)', /<w:sz w:val="16"\/>/.test(rPr), rPr);
  check('not underlined', !/<w:u w:val="single"/.test(rPr), rPr);
  check('not highlighted', !/<w:highlight/.test(rPr), rPr);
}

console.log('\n[7] box/emphasis run: underline + highlight + the real single-line auto-color border — matches the "Emphasis" style exactly');
{
  const rPr = rPrBefore(xml, 'Trump');
  check('underlined', /<w:u w:val="single"/.test(rPr), rPr);
  check('highlighted cyan', /<w:highlight w:val="cyan"/.test(rPr), rPr);
  check('single-line border', /<w:bdr w:val="single"/.test(rPr), rPr);
  check('border size 8 (matches w:sz="8" in the real style)', /w:sz="8"/.test(rPr), rPr);
  check('border space 0', /w:space="0"/.test(rPr), rPr);
  check('border color auto', /w:color="auto"/.test(rPr), rPr);
  check('not bold (Emphasis style sets b="0")', !/<w:b\/>/.test(rPr), rPr);
}
{
  const rPr = rPrBefore(xml, 'bleak');
  check('second boxed word also gets the border', /<w:bdr w:val="single"/.test(rPr), rPr);
}

console.log('\n[8] box without highlight exports the border + underline but no highlight');
{
  const xml2 = await documentXml({
    ...card,
    bodyRuns: [{ text: 'Republican House', underline: true, box: true }],
  });
  const rPr = rPrBefore(xml2, 'Republican House');
  check('single-line border', /<w:bdr w:val="single"/.test(rPr), rPr);
  check('underlined', /<w:u w:val="single"/.test(rPr), rPr);
  check('no highlight', !/<w:highlight/.test(rPr), rPr);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
