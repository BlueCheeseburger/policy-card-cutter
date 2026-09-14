// Browser-side port of Warroom's electron/main.ts `ai:cutterReadSource` step 1
// (extract cite metadata, body paragraphs, and images from a saved web page or
// PDF). Node's `cheerio` becomes the browser-native `DOMParser`; Node's
// `pdf-parse` (backed by pdf.js under the hood anyway) becomes `pdfjs-dist`
// run directly in the page.
//
// One real constraint from having no filesystem access: when you save a page
// as "Webpage, Complete", the browser writes `page.html` *and* a sibling
// `page_files/` folder holding the images referenced by relative paths. A
// plain `<input type="file">` only ever hands you the one selected file, so
// relative image paths can't be resolved unless the user picks the *folder*
// instead (via `webkitdirectory`) — see `readFolderSource` below. A single
// .html file still works fine for text; its images just won't resolve unless
// they were already absolute/data URLs in the source markup.

export interface RawSource {
  kind: 'pdf' | 'html';
  rawParagraphs: string[];
  images: { src: string; alt: string }[];
  metaUrl: string;
  metaTitle: string;
}

const AD_SELECTOR = '[class*="ad-"],[id*="ad-"],[class*="advert"],[class*="newsletter"],[class*="related"],[class*="share"],[class*="social"],[class*="comment"],[class*="promo"],[role="navigation"]';
const IMAGE_JUNK_RE = /logo|icon|avatar|sprite|spacer|pixel|tracking|advert|sponsor|banner|emoji|share|social|thumb-|favicon/i;

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

// `resolveRelative` looks up a relative image path against the sibling
// `_files` folder when the user picked a whole folder (see readFolderSource);
// it returns null (skip the image) for a plain single-file pick.
async function extractImages(
  main: Element,
  resolveRelative: ((relPath: string) => Promise<string | null>) | null,
): Promise<{ src: string; alt: string }[]> {
  const out: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  const imgs = Array.from(main.querySelectorAll('img'));
  for (const img of imgs) {
    if (out.length >= 24) break;
    const src = (img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '').trim();
    const alt = (img.getAttribute('alt') || '').trim();
    if (!src) continue;
    const w = parseInt(img.getAttribute('width') || '0', 10);
    const h = parseInt(img.getAttribute('height') || '0', 10);
    const meta = `${src} ${alt} ${img.getAttribute('class') || ''} ${img.id || ''}`.toLowerCase();
    if (IMAGE_JUNK_RE.test(meta)) continue;
    if ((w && w < 100) || (h && h < 100)) continue;

    let resolved: string | null = null;
    if (/^https?:\/\//i.test(src)) resolved = src;
    else if (/^data:image\//i.test(src)) { if (src.length > 256) resolved = src; }
    else if (resolveRelative) {
      const rel = decodeURIComponent(src.replace(/^\.?\//, '').split('?')[0].split('#')[0]);
      resolved = await resolveRelative(rel);
    }
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push({ src: resolved, alt });
  }
  return out;
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

async function readHtmlCommon(html: string, resolveRelative: ((rel: string) => Promise<string | null>) | null): Promise<RawSource> {
  const doc = parseHtmlDoc(html);
  const { metaUrl, metaTitle } = metaFrom(doc);
  const main = pickMain(doc);

  // nav/footer/aside/form are never legitimate article content, safe to strip
  // wherever found. <header> is only stripped when we fell back to <body>
  // (no <article>/<main>) — many templates wrap the headline + lead photo in
  // <article><header>...<img>...</header>, and stripping it globally would
  // delete that image.
  main.querySelectorAll('nav,footer,aside,form').forEach((el) => el.remove());
  if (main === doc.body) main.querySelectorAll('header').forEach((el) => el.remove());

  const rawParagraphs = stripToRawParagraphs(main, doc);
  const images = await extractImages(main, resolveRelative);
  return { kind: 'html', rawParagraphs, images, metaUrl, metaTitle };
}

export async function readSingleFile(file: File): Promise<RawSource> {
  const ext = (file.name.toLowerCase().split('.').pop() || '');
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml' || ext === 'mhtml' || ext === 'mht') {
    const html = await file.text();
    return readHtmlCommon(html, null);
  }
  if (ext === 'pdf') {
    const rawParagraphs = await extractPdfParagraphs(file);
    if (!rawParagraphs.length) throw new Error('Could not extract text from this PDF. If it is a scanned image, it has no selectable text.');
    return { kind: 'pdf', rawParagraphs, images: [], metaUrl: '', metaTitle: '' };
  }
  throw new Error(`Unsupported file type: .${ext}. Import a saved web page (.html) or a .pdf.`);
}

// Whole-folder pick (webkitdirectory): finds the .html file plus every sibling
// asset, so relative <img src="page_files/foo.jpg"> paths can resolve.
export async function readFolderSource(files: FileList): Promise<RawSource> {
  const list = Array.from(files);
  const htmlFile = list.find((f) => /\.(html?|xhtml|mhtml?|mht)$/i.test(f.name));
  if (!htmlFile) throw new Error('No .html file found in that folder.');

  const byRelPath = new Map<string, File>();
  for (const f of list) {
    const rel = (f as any).webkitRelativePath || f.name;
    // Strip the top-level folder segment so lookups match the src's own relative path.
    const parts = rel.split('/');
    byRelPath.set(parts.slice(1).join('/'), f);
    byRelPath.set(parts[parts.length - 1], f); // filename-only fallback
  }

  const resolveRelative = async (rel: string): Promise<string | null> => {
    const match = byRelPath.get(rel) || byRelPath.get(rel.split('/').pop() || rel);
    if (!match) return null;
    if (match.size > 4_000_000) return null;
    return await fileToDataUrl(match);
  };

  const html = await htmlFile.text();
  return readHtmlCommon(html, resolveRelative);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
