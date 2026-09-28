// Browser-side port of Warroom's electron/main.ts `ai:cutterReadSource` step 1
// (extract cite metadata and body paragraphs from a saved web page or
// PDF). Node's `cheerio` becomes the browser-native `DOMParser`; Node's
// `pdf-parse` (backed by pdf.js under the hood anyway) becomes `pdfjs-dist`
// run directly in the page.

export interface RawSource {
  kind: 'pdf' | 'html';
  rawParagraphs: string[];
  metaUrl: string;
  metaTitle: string;
}

const AD_SELECTOR = '[class*="ad-"],[id*="ad-"],[class*="advert"],[class*="newsletter"],[class*="related"],[class*="share"],[class*="social"],[class*="comment"],[class*="promo"],[role="navigation"]';

function stripToRawParagraphs(main: Element, doc: Document): string[] {
  const paras: string[] = [];
  main.querySelectorAll('p,li,blockquote,h2,h3').forEach((el) => {
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t && t.split(' ').length >= 3) paras.push(t);
  });
  if (paras.length === 0) {
    const bodyText = doc.body?.textContent ?? '';
    return bodyText.split(/\n{2,}/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.split(' ').length >= 4);
  }
  return paras;
}

function pickMain(doc: Document): Element {
  let main: Element | null = doc.querySelector('article');
  if (!main) main = doc.querySelector('main');
  if (!main) main = doc.body;
  return main!;
}

function parseHtmlDoc(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,iframe,svg,button,figcaption').forEach((el) => el.remove());
  doc.querySelectorAll(AD_SELECTOR).forEach((el) => el.remove());
  return doc;
}

function metaFrom(doc: Document): { metaUrl: string; metaTitle: string } {
  const metaUrl =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || '';
  const metaTitle = (
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('title')?.textContent || ''
  ).trim();
  return { metaUrl, metaTitle };
}

function readHtml(html: string): RawSource {
  const doc = parseHtmlDoc(html);
  const { metaUrl, metaTitle } = metaFrom(doc);
  const main = pickMain(doc);

  // nav/footer/aside/form are never article content. <header> is only
  // stripped when we fell back to <body> (no <article>/<main>).
  main.querySelectorAll('nav,footer,aside,form').forEach((el) => el.remove());
  if (main === doc.body) main.querySelectorAll('header').forEach((el) => el.remove());

  const rawParagraphs = stripToRawParagraphs(main, doc);
  return { kind: 'html', rawParagraphs, metaUrl, metaTitle };
}

export async function readSingleFile(file: File): Promise<RawSource> {
  const ext = (file.name.toLowerCase().split('.').pop() || '');
  if (ext === 'mhtml' || ext === 'mht') return readHtml(htmlFromMhtml(await file.text()));
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return readHtml(await file.text());
  if (ext === 'pdf') {
    const rawParagraphs = await extractPdfParagraphs(file);
    if (!rawParagraphs.length) throw new Error('Could not extract text from this PDF. If it is a scanned image, it has no selectable text.');
    return { kind: 'pdf', rawParagraphs, metaUrl: '', metaTitle: '' };
  }
  throw new Error(`Unsupported file type: .${ext}. Import a saved web page (.html) or a .pdf.`);
}

// An .mhtml/.mht file (Chrome's "Webpage, Single File") is a MIME multipart
// message, not HTML — pull out its first text/html part and undo its
// transfer encoding (quoted-printable or base64) before parsing.
export function htmlFromMhtml(raw: string): string {
  const boundary = raw.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  const parts = boundary ? raw.split('--' + boundary) : [raw];
  const part = parts.find((p) => /content-type:\s*text\/html/i.test(p));
  if (!part) throw new Error('No HTML found inside this .mhtml file.');
  const split = part.search(/\r?\n\r?\n/);
  const headers = part.slice(0, split);
  const body = part.slice(split).trim();
  const encoding = headers.match(/content-transfer-encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase();
  if (encoding === 'base64') return decodeUtf8(Uint8Array.from(atob(body.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
  if (encoding === 'quoted-printable') {
    const unwrapped = body.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < unwrapped.length; i++) {
      const hex = unwrapped[i] === '=' ? unwrapped.slice(i + 1, i + 3) : '';
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; }
      else bytes.push(unwrapped.charCodeAt(i) & 0xff);
    }
    return decodeUtf8(Uint8Array.from(bytes));
  }
  return body;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

// ─── PDF text extraction (pdfjs-dist) ──────────────────────────────────────

async function extractPdfParagraphs(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdf.js gives us positioned text items, not paragraphs — join a page's
    // items with spaces (close enough for the AI's body-paragraph pass), and
    // separate pages with a blank line so the paragraph-splitting below still
    // treats each page boundary as a break, mirroring pdf-parse's plain output.
    const text = content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ');
    pageTexts.push(text);
  }
  const fullText = pageTexts.join('\n\n').trim();
  if (!fullText) return [];
  let paragraphs = fullText.split(/\n{2,}/).map((s) => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  if (paragraphs.length < 3) paragraphs = fullText.split(/\n/).map((s) => s.trim()).filter(Boolean);
  return paragraphs;
}
