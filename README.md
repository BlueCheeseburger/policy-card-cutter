# Policy Card Cutter

A standalone AI-assisted debate card cutter. Import a saved web article or PDF,
optionally narrow it to specific paragraphs, and the AI decides underline/
highlight/small-text emphasis and proposes taglines — producing a formatted
card you can copy or export to `.docx`.

## Top 5 features

1. **Full AI card cutting from a real source.** Point it at a saved article
   or PDF and it reads the cite, the real body paragraphs (boilerplate,
   nav, and newsletter prompts filtered out), and the images — then decides
   what to underline, highlight, and shrink, and proposes 1–2 taglines.
2. **Highlight density, no extra AI call.** One AI response is tiered
   (essential / standard / full); the Less/Medium/More slider re-renders
   instantly by filtering locally, instead of re-cutting the card three times.
3. **Refine in plain language.** A text box sends the cut card back with an
   instruction ("underline less", "highlight the statistics") instead of a
   manual underline/highlight/font-size toolbar to fight with.
4. **Bring your own key, no account, no backend.** Gemini, Anthropic, OpenAI,
   or Grok — your key lives only in this browser and talks directly to the
   provider you pick. Nothing is uploaded anywhere else.
5. **Export straight to `.docx` or plain text**, formatted the way a
   Verbatim-style card actually looks (underline = read aloud, highlight =
   most important, small = kept for context).

What sets it apart: it does exactly one job instead of being a card-cutting
tab bolted onto a full case-prep suite, it has no server or account to trust
with the article or the key, and its core logic was pulled out of a larger
app (Warroom) that had already been used and fixed for real debate rounds —
see "Relationship to Warroom" below. See [`changelog.md`](changelog.md) for
this fork's changes.

## Relationship to Warroom

The card-cutting feature — the prompts, the card-cutting skill rules, and the
word-boundary-aware emphasis logic in `src/utils/cardFormat.ts` — is ported
from [Warroom](https://github.com/BlueCheeseburger/warroom), along with a new
test suite (`scripts/test-*.ts`) written directly against the ported modules
where Warroom itself had no equivalent test to copy — see "Tests" below.
Warroom's card database, team files, and Tabroom lookups are not here and are
not planned: this app owns nothing but the one card you're currently cutting,
in one browser tab, for as long as that tab is open.

## Architecture

- **No backend.** Your AI provider API key is stored only in this browser's
  `localStorage` and used to call the provider directly from the page
  ("bring your own key"). Nothing is sent anywhere except the provider you
  pick in Settings.
- **An API key here is not protected.** It sits in browser storage because a
  page with no accounts has nowhere better to put it, and anything running in
  this origin can read it. Warroom encrypts stored keys with Electron's
  `safeStorage`; there is no browser equivalent to that, so this app doesn't
  pretend to have one — on a shared computer, be careful.
- **CORS caveat:** Gemini and Anthropic both allow direct browser calls
  (Anthropic via the `anthropic-dangerous-direct-browser-access` header).
  OpenAI and xAI's chat-completions APIs do not send CORS headers for
  arbitrary origins, so calls to those two will generally fail with a browser
  network error — there's no backend here to proxy around it. Settings flags
  this next to those two providers.
- **`src/platform/`** replaces every Electron/Node capability the card cutter
  actually depended on, one file per capability, matching Warroom's old
  contract as closely as a browser allows:
  - `files.ts` — Warroom's native file dialog returned a real filesystem path
    that the IPC handler then read with `fs`. A browser has no paths, so
    `openFile`/`openFolder` hand back an opaque `pcc-file:.../name` (or
    `pcc-folder:...`) handle from an in-memory `File`/`FileList` registry
    instead — everything downstream resolves that handle rather than
    touching disk. The registry is page-load-scoped; a handle from a closed
    tab resolves to nothing.
  - `settings.ts` — the AI provider, key(s), and cite-year preference, in
    `localStorage`. This is new surface, not a shimmed contract: Warroom's
    `CardCutter.tsx` never read settings itself, only `main.ts` did.
  - `ai.ts` — exposes exactly the two methods `CardCutter.tsx` used to call
    over IPC, `cutterReadSource(handle)` and `cutterEmphasize(params)`, same
    names and near-identical shapes (the file-path argument is now a
    `files.ts` handle; `highlightColor` is dropped from `cutterEmphasize`
    since Warroom's own handler never used it). Everything below those two
    functions — the actual per-provider `fetch()` calls — has no Warroom
    equivalent to shim at all, since that logic ran in Electron's main
    process where no component could see it; porting the feature to a plain
    tab means it has nowhere left to live but here.
- **HTML parsing** (`src/utils/readSource.ts`) uses the browser's native
  `DOMParser` in place of Warroom's Node-side `cheerio`. **PDF parsing** uses
  `pdfjs-dist` in place of `pdf-parse`.
- **Images in a saved page:** picking a single `.html` file only resolves
  images that were already absolute URLs or inline `data:` URLs in the
  markup. To pull in a page saved as "Webpage, Complete" (which writes a
  sibling `..._files/` folder for images), use "Choose a saved-page folder"
  instead — it accepts the whole folder via `webkitdirectory` and resolves
  relative image paths against it.
- Cards are session-only (not persisted to a database) — cut, review, then
  copy as text or download as `.docx`.

## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Runs every `scripts/test-*.ts` as its own process (`scripts/test-all.ts`).
Warroom has no dedicated test file for the card-cutter's own pure logic
(`cardFormat.ts`'s span matching, the prompt-template substitution) — checked
directly, nothing in its `scripts/` references either — so these were written
new, against the ported modules, rather than copied. If a future change to
`cardFormat.ts` or `prompt.ts` breaks word-boundary matching, the highlight
density tiers, or the `{{VAR}}` substitution contract, this is what catches it.

## Prompts & skill

`src/prompts/*.txt` and `src/skills/card_cutting.md` are the exact prompt
templates and card-cutting rules this app sends to the AI, ported verbatim
from Warroom. Edit them directly — they're loaded via Vite's `?raw` import,
no build step required beyond a page reload.
