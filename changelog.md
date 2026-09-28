# Changelog

All notable changes to this fork are recorded here. Dates are when the change
landed in this repo, not necessarily when the underlying feature first shipped
in [Warroom](https://github.com/BlueCheeseburger/warroom).

## 2026-09-28

### Changed
- The finished card is one read-only page — tag, cite, and body together —
  on white with black text in every theme, instead of separate editable
  fields. Small text stays black. Copy/download are right below it.
- Cutter page fills the whole window.
- Taglines can now carry underlines as well as caps (more underlines than
  caps); underlined tag words export underlined in the .docx.
- Prompts are no longer editable. The one editable piece is a new
  "How to cut cites" field in Settings, prefilled with the standard rules.
- Short cites are chosen automatically: month-day (`Brady 3-15`) for sources
  from roughly the past two months, two-digit year (`Brady 26`) otherwise.
  The Settings toggle for this was removed.

### Added
- Proper .mhtml support (decodes Chrome's single-file saved pages).

### Removed
- Images: no image extraction, no picture picker, no "saved-page folder"
  import. Sources are text only (.html, .mhtml, .pdf).

### Fixed
- Raised the AI output-token limit (Gemini's thinking tokens count
  against it), so long cuts no longer get truncated.

## 2026-09-14

### Added
- Initial scaffold: Vite + React + TypeScript, ported from Warroom's card
  cutter feature — same prompts, same card-cutting skill rules, same
  highlight-density/refine UX.
- `src/platform/` capability layer (`files.ts`, `settings.ts`, `ai.ts`)
  replacing Warroom's Electron/IPC dependencies, matching the old contracts
  (`cutterReadSource`, `cutterEmphasize`) where a component actually
  depended on them.
- `scripts/test-*.ts` test suite for `cardFormat.ts`'s span matching and
  `prompt.ts`'s `{{VAR}}` substitution — new tests, since Warroom itself has
  none covering this logic.
- `.docx` export and copy-as-text for a finished card.
- README sections: top-5 features, "Relationship to Warroom" (scope cut:
  no card database, no team files, no Tabroom lookups), architecture notes
  (no backend, bring-your-own-key, CORS caveat per provider, unprotected
  API key storage vs. Warroom's `safeStorage`).
