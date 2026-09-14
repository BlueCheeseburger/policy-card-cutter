# Policy Card Cutter

A standalone AI-assisted debate card cutter. Import a saved web article or PDF,
optionally narrow it to specific paragraphs, and the AI decides underline/
highlight/small-text emphasis and proposes taglines — producing a formatted
card you can copy or export to `.docx`.

Ported from a feature originally built inside [Warroom](../warroom), but this
is a separate, standalone Vite web app with no shared codebase or backend.

## Architecture

- **No backend.** Your AI provider API key is stored only in this browser's
  `localStorage` and used to call the provider directly from the page
  ("bring your own key"). Nothing is sent anywhere except the provider you pick
  in Settings.
- **CORS caveat:** Gemini and Anthropic both allow direct browser calls
  (Anthropic via the `anthropic-dangerous-direct-browser-access` header).
  OpenAI and xAI's chat-completions APIs do not send CORS headers for
  arbitrary origins, so calls to those two will generally fail with a browser
  network error — there's no backend here to proxy around it. Settings flags
  this next to those two providers.
- **HTML parsing** uses the browser's native `DOMParser` (in place of
  Warroom's Node-side `cheerio`). **PDF parsing** uses `pdfjs-dist` (in place
  of `pdf-parse`).
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

## Prompts & skill

`src/prompts/*.txt` and `src/skills/card_cutting.md` are the exact prompt
templates and card-cutting rules this app sends to the AI, ported verbatim
from Warroom. Edit them directly — they're loaded via Vite's `?raw` import,
no build step required beyond a page reload.
