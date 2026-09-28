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

// Junk is matched on whole class/id *words* (split on - and _), never
// substrings: `[class*="ad-"]` also hit "lead-paragraph", "thread-body" and
// "read-view", and `[class*="comment"]` hit "commentary", silently deleting
// real article text.
const JUNK_WORDS = new Set(['ad', 'ads', 'advert', 'advertisement', 'advertising', 'newsletter', 'related', 'share', 'sharing', 'social', 'comment', 'comments', 'promo', 'promotion', 'sponsored']);
const PARA_SELECTOR = 'p,li,blockquote,h2,h3';

export function isJunkNames(className: string, id: string): boolean {
  return `${className} ${id}`.toLowerCase().split(/[\s_-]+/).some((w) => JUNK_WORDS.has(w));
}

function isJunk(el: Element): boolean {
  return el.getAttribute('role') === 'navigation' || isJunkNames(el.getAttribute('class') ?? '', el.id ?? '');
}

function stripToRawParagraphs(main: Element, doc: Document): string[] {
  const paras: string[] = [];
  main.querySelectorAll(PARA_SELECTOR).forEach((el) => {
    // A blockquote/li that wraps its own <p> would repeat that text — take the inner blocks instead.
    if (el.querySelector(PARA_SELECTOR)) return;
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
  // Only strip junk *inside* the chosen main — never main itself or its ancestors,
  // so a wrapper class like "social-page" can't delete the whole article.
  Array.from(main.querySelectorAll('*')).filter(isJunk).forEach((el) => el.remove());
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
  const paragraphs: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: any) => 'str' in it && it.str.trim())
      .map((it: any) => ({ text: it.str as string, y: it.transform[5] as number }));
    paragraphs.push(...paragraphsFromPdfItems(items));
  }
  return paragraphs;
}

// pdf.js hands back positioned text fragments, not paragraphs. Group
// fragments into lines by baseline (y), then start a new paragraph wherever
// the vertical gap to the previous line is clearly bigger than the page's
// normal line spacing (or the text jumps back up, e.g. a new column). A page
// boundary is always a break. Pure, so it's tested without a real PDF.
export function paragraphsFromPdfItems(items: { text: string; y: number }[]): string[] {
  const lines: { y: number; text: string }[] = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2) last.text += ' ' + it.text;
    else lines.push({ y: it.y, text: it.text });
  }
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b);
  const normal = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const out: string[] = [];
  let cur = '';
  lines.forEach((l, i) => {
    const gap = i ? lines[i - 1].y - l.y : 0;
    if (cur && (gap < 0 || (normal && gap > normal * 1.5))) { out.push(cur); cur = ''; }
    cur += (cur ? ' ' : '') + l.text;
  });
  if (cur) out.push(cur);
  return out.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
