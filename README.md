# Policy Card Cutter

An AI-assisted debate card cutter. Open the page, drop in a saved article or
PDF, and cut a formatted card — no account, no sign-up, nothing to install.

## The five biggest things it does

1. **Full AI card cutting from a real source.** Point it at a saved article
   or PDF and it reads the cite, the real body paragraphs (boilerplate, nav,
   and newsletter prompts filtered out), and the images — then decides what
   to underline, highlight, and shrink, and proposes 1–2 taglines.
2. **Highlight density, no extra AI call.** One AI response is tiered
   (essential / standard / full); the Less/Medium/More slider re-renders
   instantly by filtering locally, instead of re-cutting the card three times.
3. **Refine in plain language.** A text box sends the cut card back with an
   instruction ("underline less", "highlight the statistics") instead of a
   manual underline/highlight/font-size toolbar to fight with.
4. **Bring your own key, no account, no backend.** Gemini, Anthropic, or your
   own local LM Studio server — your key (or nothing, for LM Studio) lives
   only in this browser and talks directly to the provider you pick. Nothing
   is uploaded anywhere else. No model dropdown either — type the exact model
   name your provider expects.
5. **Export straight to `.docx` or plain text**, formatted the way a
   Verbatim-style card actually looks (underline = read aloud, highlight =
   most important, boxed = the single most essential word, small = kept for
   context).

See [changelog.md](changelog.md) for what's changed in this fork over time.

## Running it

```bash
npm install
npm run dev
```

`npm run build` typechecks and builds; `npm test` runs the headless suite.

## Configuration

None required to install — there's no `.env`. Open the app, click Settings,
pick a provider (Gemini, Anthropic, or LM Studio), and either paste an API
key or point it at your local LM Studio server. Type the exact model name —
there's no dropdown, and no tier system underneath it; whatever you type is
what every call uses. The key (if any) is written to this browser's
`localStorage` and used directly from the page; nothing is sent anywhere
except that provider. See "Things worth knowing" below for what that means
for the key's safety.

## Deploying

Import the repo on Vercel; the Vite preset is auto-detected and needs no
`vercel.json`. There's no routing beyond a single page, so there are no
rewrites to configure either, and — since there's no `.env` — no environment
variables to set before the first build.

## How it is put together

```
src/utils/      pure logic — parsing, span matching, prompt substitution, docx export
src/platform/   everything that touches the outside world
src/components/ the UI
scripts/        headless tests for src/utils
```

`src/utils` has no dependency beyond the DOM and the browser's own `fetch`,
which is why the tests in `scripts/` can run it headlessly. Anything that
reaches outward — the AI provider, the file/folder picker, settings —
lives in `src/platform` behind a small interface (`files.ts`, `settings.ts`,
`ai.ts`), so the parts worth trusting stay testable and the parts that can
fail stay in one place.

## Things worth knowing

**An API key here is not protected.** It sits in browser storage because a
page with no accounts has nowhere better to put it, and anything running in
this origin can read it. Warroom encrypts stored keys with Electron's
`safeStorage`; there is no browser equivalent to that, so this app doesn't
pretend to have one. On a shared computer, be careful.

**Only three providers are offered, because they're the only three a browser
tab can actually reach with no backend.** Gemini and Anthropic both serve
CORS headers that let a browser call them directly (Anthropic needs the
`anthropic-dangerous-direct-browser-access` header, which this app sends).
LM Studio runs on your own machine — the page is HTTPS and LM Studio is
`http://localhost`, which Chrome, Edge, and Firefox treat as trustworthy;
Safari blocks it entirely. LM Studio's own CORS setting also has to be
turned on. OpenAI and xAI were considered and dropped: their chat-completions
APIs never send CORS headers for a browser origin, so a call to either always
failed with a network error here — there was no working path to keep.

**A card lives only as long as the tab does.** There is no database. Cut a
card, copy it as text or download it as `.docx`, and it's gone the moment you
close the tab or cut another one. This is deliberate, not a missing feature —
see "Relationship to Warroom" below.

**Images in a saved page need the whole folder, not just the `.html`.**
Saving a page as "Webpage, Complete" writes a sibling `..._files/` folder for
its images; a browser can't reach that folder from a single-file picker. Use
"Choose a saved-page folder" instead of "Choose a file" and it resolves the
relative image paths against everything in it.

## Rules the code follows

These are not style preferences — each one is a bug that already happened
once, in Warroom, before this feature was pulled out into its own app.

- **A failure is never laundered into a success.** An unparseable AI reply
  throws instead of becoming a blank card that silently reports `ok: true`.
  Zero highlights or zero taglines is treated as a failed cut, not an empty
  but "successful" one.
- **Nothing is silently truncated.** A body or article too long for one call
  is capped only after asking, with the real character counts, and declining
  cancels the call rather than sending a confidently-wrong partial answer.
- **The provider's own error text survives.** A friendlier, paraphrased
  version exists for inline UI use, but it never replaces the real one —
  see `humanizeAiError` in `src/platform/ai.ts`.
- **Word-boundary-safe span matching.** A short highlight fragment (e.g.
  "in") can't land mid-word inside an unrelated word (e.g. "administrative")
  just because the letters match — see `cardFormat.ts` and its test.
- **Every color is a token, defined for both light and dark.** A value
  defined once produces the wrong contrast in the other mode.

## Relationship to Warroom

The card-cutting feature — the prompts, the card-cutting skill rules, and the
word-boundary-aware emphasis logic in `src/utils/cardFormat.ts` — is ported
from [Warroom](https://github.com/BlueCheeseburger/warroom), along with a new
test suite (`scripts/test-*.ts`) written directly against the ported modules
where Warroom itself had no equivalent test to copy. Warroom's card database,
team files, and Tabroom lookups are not here and are not planned: this app
owns nothing but the one card you're currently cutting, in one browser tab,
for as long as that tab is open.

## License

MIT — see [LICENSE](LICENSE).
