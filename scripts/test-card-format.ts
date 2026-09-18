// Pure-logic tests for src/utils/cardFormat.ts — the word-boundary-aware span
// matcher and the highlight-density tier filter. Warroom itself has no
// dedicated test file for this module (checked: nothing in its scripts/
// references cardFormat.ts, buildAttrsFromSpans, or findRanges), so unlike
// the rest of this port there was nothing to copy verbatim — this is a new
// test written against the ported module directly, in the same
// check()/pass/fail style as Warroom's own scripts/test-*.ts files so a
// green run here means the same thing it would over there.
//
// Run:  npx tsx scripts/test-card-format.ts

import { buildAttrsFromSpans, runsFromAttrs, runsToPlain } from '../src/utils/cardFormat';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}

console.log('\n[1] runsFromAttrs never changes the underlying text');
{
  const text = 'The quick brown fox jumps over the lazy dog in the administrative building.';
  const attrs = buildAttrsFromSpans(text, {
    underline: ['quick brown fox jumps'],
    highlight: [{ text: 'quick brown', tier: 1 }, { text: 'jumps', tier: 2 }],
    small: ['in the administrative building'],
  }, 'yellow', 3);
  const runs = runsFromAttrs(text, attrs);
  check('joined runs equal the original text exactly', runsToPlain(runs) === text, runsToPlain(runs));
}

console.log('\n[2] word-boundary safety — a short fragment must not match mid-word');
{
  const text = 'Officials cited the administrative burden as the deciding factor.';
  // "in" appears inside "administrative" but nowhere as its own word here —
  // a naive substring match would light up the middle of that word.
  const attrs = buildAttrsFromSpans(text, { underline: ['in'] }, 'yellow', 3);
  const runs = runsFromAttrs(text, attrs);
  const underlined = runs.filter((r) => r.underline).map((r) => r.text).join('');
  check('no mid-word match landed', underlined === '', `underlined: "${underlined}"`);
}
{
  const text = 'In the end, officials reversed the decision.';
  const attrs = buildAttrsFromSpans(text, { underline: ['In'] }, 'yellow', 3);
  const runs = runsFromAttrs(text, attrs);
  const underlined = runs.filter((r) => r.underline).map((r) => r.text).join('');
  check('a real word-start match still lands', underlined === 'In', `underlined: "${underlined}"`);
}

console.log('\n[3] a match starting at punctuation (em dash) is always boundary-safe');
{
  const text = 'a single criterion—which courts have never resolved—remains open.';
  const attrs = buildAttrsFromSpans(text, { underline: ['—which courts have never resolved'] }, 'yellow', 3);
  const runs = runsFromAttrs(text, attrs);
  const underlined = runs.filter((r) => r.underline).map((r) => r.text).join('');
  check('the em-dash-led fragment matched', underlined === '—which courts have never resolved', underlined);
}

console.log('\n[4] highlight density tiers filter independently, without re-running underline/small');
{
  const text = 'Substantive evidence shows real impact on argumentation quality outcomes.';
  const spans = {
    underline: [text],
    highlight: [
      { text: 'Substantive evidence', tier: 1 as const },
      { text: 'real impact', tier: 2 as const },
      { text: 'argumentation quality', tier: 3 as const },
    ],
    small: [],
  };
  const counts = [1, 2, 3].map((level) => {
    const attrs = buildAttrsFromSpans(text, spans, 'cyan', level as 1 | 2 | 3);
    return runsFromAttrs(text, attrs).filter((r) => r.highlight).length;
  });
  check('level 1 shows only tier-1 highlights', counts[0] === 1, `got ${counts[0]}`);
  check('level 2 adds tier-2 (cumulative, not a swap)', counts[1] === 2, `got ${counts[1]}`);
  check('level 3 shows all three', counts[2] === 3, `got ${counts[2]}`);
  check('density levels are monotonically non-decreasing', counts[0] <= counts[1] && counts[1] <= counts[2]);
}

console.log('\n[5] small text and underline/highlight can coexist without one erasing the other');
{
  const text = 'Kept for context, but the core claim is what gets read aloud.';
  const attrs = buildAttrsFromSpans(text, {
    underline: ['the core claim is what gets read aloud'],
    highlight: [{ text: 'core claim', tier: 1 }],
    small: ['Kept for context, but'],
  }, 'green', 3);
  const runs = runsFromAttrs(text, attrs);
  const smallRun = runs.find((r) => r.fontSize === 8);
  const underlinedRun = runs.find((r) => r.underline && !r.highlight);
  const highlightedRun = runs.find((r) => r.highlight);
  check('a small run exists', !!smallRun);
  check('a plain underlined run exists', !!underlinedRun);
  check('a highlighted run exists', !!highlightedRun);
}

console.log('\n[6] box is unconditional (like underline), independent of the highlight-density level');
{
  const text = 'The US government open pursuit of nuclear invulnerability through missile defense.';
  const spans = {
    underline: [text],
    highlight: [{ text: 'pursuit of nuclear invulnerability', tier: 3 as const }],
    box: ['nuclear invulnerability'],
  };
  for (const level of [1, 2, 3] as const) {
    const attrs = buildAttrsFromSpans(text, spans, 'cyan', level);
    const runs = runsFromAttrs(text, attrs);
    const boxed = runs.filter((r) => r.box).map((r) => r.text).join('');
    check(`level ${level}: box still renders even though its highlight is tier 3`, boxed === 'nuclear invulnerability', boxed);
  }
}

console.log('\n[7] box nests inside highlight — a boxed run is also highlighted and underlined');
{
  const text = 'Western allies present themselves as responsible nuclear actors.';
  const attrs = buildAttrsFromSpans(text, {
    underline: [text],
    highlight: [{ text: 'Western allies present themselves as responsible', tier: 2 }],
    box: ['responsible'],
  }, 'cyan', 3);
  const runs = runsFromAttrs(text, attrs);
  const boxedRun = runs.find((r) => r.box);
  check('the boxed run exists', !!boxedRun);
  check('the boxed run is also highlighted', boxedRun?.highlight === 'cyan');
  check('the boxed run is also underlined', boxedRun?.underline === true);
  check('the boxed run is exactly the box text, not the whole highlight', boxedRun?.text === 'responsible', boxedRun?.text);
}

console.log('\n[8] box without highlight — still underlined, gets the box, no highlight color (real Emphasis-without-highlight runs)');
{
  const text = 'that could net five Republican House seats in November.';
  const attrs = buildAttrsFromSpans(text, {
    underline: [text],
    highlight: [{ text: 'net five', tier: 1 }],
    box: ['Republican House'],
  }, 'cyan', 3);
  const runs = runsFromAttrs(text, attrs);
  const boxed = runs.find((r) => r.box);
  check('the box lands on the unhighlighted words', boxed?.text === 'Republican House', boxed?.text);
  check('boxed-but-unhighlighted run has no highlight color', boxed?.highlight === undefined);
  check('boxed-but-unhighlighted run is still underlined', boxed?.underline === true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
