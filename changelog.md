# Changelog

All notable changes to this fork are recorded here. Dates are when the change
landed in this repo, not necessarily when the underlying feature first shipped
in [Warroom](https://github.com/BlueCheeseburger/warroom).

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
