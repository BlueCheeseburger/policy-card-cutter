// Tests .mhtml decoding in src/utils/readSource.ts: Chrome's "Webpage, Single
// File" saves a MIME multipart message, and the HTML part is usually
// quoted-printable encoded — it has to be unwrapped before it can be parsed.
//
// Run:  npx tsx scripts/test-read-source.ts

import { htmlFromMhtml, paragraphsFromPdfItems, isJunkNames } from '../src/utils/readSource';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  →  ' + extra : ''}`); }
}

const qp = [
  'From: <Saved by Blink>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related; type="text/html"; boundary="----MultipartBoundary--abc"',
  '',
  '------MultipartBoundary--abc',
  'Content-Type: text/html',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<html><body><p class=3D"lead">Deterrence depends on a very long sentence that =',
  'wraps â\u0080\u0094 with an em dash.</p></body></html>',
  '------MultipartBoundary--abc',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  '',
  'iVBORw0KGgo=',
  '------MultipartBoundary--abc--',
].join('\r\n').replace('â\u0080\u0094', '=E2=80=94');

console.log('\n[1] quoted-printable HTML part is decoded');
{
  const html = htmlFromMhtml(qp);
  check('=3D decoded to =', html.includes('class="lead"'), html);
  check('soft line break joined', html.includes('sentence that wraps'), html);
  check('UTF-8 em dash decoded', html.includes('—'), html);
  check('image part ignored', !html.includes('iVBOR'));
}

console.log('\n[2] base64 HTML part is decoded');
{
  const b64 = btoa('<p>Hello base64</p>');
  const raw = `Content-Type: multipart/related; boundary="B"\r\n\r\n--B\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n--B--`;
  check('decoded', htmlFromMhtml(raw).includes('Hello base64'));
}

console.log('\n[3] junk detection matches whole words, never substrings');
{
  for (const real of ['lead-paragraph', 'thread-body', 'read-view', 'commentary', 'broadcast-story', 'head-title', 'gradient-box']) {
    check(`keeps "${real}"`, !isJunkNames(real, ''), real);
  }
  for (const junk of ['ad-slot', 'top_ad', 'social-share', 'related-articles', 'newsletter-signup', 'comments', 'promo']) {
    check(`removes "${junk}"`, isJunkNames(junk, ''), junk);
  }
  check('matches on id too', isJunkNames('', 'ad-banner'));
}

console.log('\n[4] PDF lines split into paragraphs on bigger-than-normal vertical gaps');
{
  const items = [
    { text: 'Para one line one', y: 700 }, { text: 'continues here', y: 700 },
    { text: 'para one line two', y: 686 }, { text: 'para one line three', y: 672 },
    { text: 'Para two starts', y: 632 }, { text: 'and ends', y: 618 },
  ];
  const paras = paragraphsFromPdfItems(items);
  check('two paragraphs', paras.length === 2, JSON.stringify(paras));
  check('same-baseline fragments joined into one line', paras[0]?.startsWith('Para one line one continues here'), paras[0]);
  check('empty input gives none', paragraphsFromPdfItems([]).length === 0);
  check('single block stays one paragraph', paragraphsFromPdfItems([{ text: 'a', y: 100 }, { text: 'b', y: 86 }, { text: 'c', y: 72 }]).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
