# Card Cutting — Verbatim Format

Cut policy debate evidence cards from raw source material. Match the exact formatting conventions below — sourced from the UC Berkeley 2026 Verbatim formatting guide.

---

## Card Anatomy

Every card has three parts in this exact order:

1. **Tag** — debater's 1–2 sentence summary of the argument. Written as a declarative claim (what the card *proves*). Uses `####` heading markdown. Bold.
2. **Cite** — author info + publication details. Plain text, NOT bolded.
3. **Body** — the excerpt from the source, underlined; the words actually read aloud are further highlighted within it.

---

## Cite Format — Follow Exactly

Pattern: `Lastname YY — First Last. Month Day, Year. Qualifications. Publication, "Title," URL`

- Separator between the short cite and the rest: ` — ` (em dash with spaces on both sides)
- After the em dash: full first+last name(s) → full date → author qualifications (as their own sentence) → publication name → article title in quotes → URL
- No brackets around the URL. No period after the URL.
- Cite is plain text — never bolded.



### Short cite rules

- 1 author: `Brady 25`
- 2 authors: `Modi and Smith 26`
- 3+ authors: `Schmitz et al. 23`
- **Time-sensitive (evidence from roughly the past two months): use month-day instead of year** → `Brady 3-15` (for March 15). Put the full year in the body of the cite instead. Only use this for evidence dated less than two months ago.
- **Everything else (including the rest of the current year): two-digit year** → `Brady 25`
- This is the default. The Card Cutter's AI step can be switched to always use the two-digit year (even for very recent sources) via Settings → General → "Current-year short cite" — when that's set, use `Brady 26` style year-round instead.

If credentials aren't in the source text, note "quals unknown" in the cite. If the exact publish date is unknown for a time-sensitive card, ask the user.

### Examples

Standard:

```
Hirsh 25 — Michael Hirsh. April 11, 2025. Former foreign editor and chief diplomatic correspondent for Newsweek, and the former national editor for Politico Magazine. Politico, "Trump May Be Triggering the Fastest Nuclear Weapons Race Since the Cold War," https://www.politico.com/news/magazine/2025/04/11/trump-says-he-fears-nuclear-weapons-so-why-is-he-making-them-more-popular-00278790
```

Time-sensitive:

```
Rubin 1-7 — Richard Rubin. 2025. US tax policy reporter for The Wall Street Journal. WSJ, "Debt-Ceiling Fight Has New X Factor: Trump," https://www.wsj.com/...
```

Two authors — first last name only in the short cite; both full names in the body, joined by "and"; each author gets their own qualification sentence:

```
Modi and Smith 26 — Shreeram Modi and John Smith. May 15, 2026. Undergraduate student at NYU. Professor of Political Science at Stanford. Daily Cal, "Title," URL
```

Three or more authors — "et al." after the first last name in the short cite; all full names listed in the body, last one joined with "and"; each author still gets their own qual sentence:

```
Schmitz 23 — Oswald J. Schmitz, Magnus Sylvén, and Trisha B. Atwood. 2023. Professor of Population and Community Ecology in the Yale School of the Environment, PhD from the University of Michigan. PhD in Animal Ecology from Lund University, Director of the Global Rewilding Alliance. Associate Professor of Ecology at Utah State University, PhD in Ecology from the University of British Columbia. Nature Climate Change, "Trophic Rewilding Can Expand Natural Climate Solutions," vol. 13
```

Journal articles — same structure, but use a DOI as the URL when available (most authoritative); if no DOI, use volume (`vol. 13`), page numbers (`p. 65-67`), or issue number (`no. 3`) in place of the URL:

```
Haynes 25 — Abby Haynes, Catherine Sherrington, et al. 2025. Research Fellow at the Institute for Musculoskeletal Health, University of Sydney, PhD. Professor, Sydney School of Public Health, University of Sydney. The International Journal of Sport and Society, "Title," https://doi.org/10.xxxxx
```

---



## Tag Format

- Use `####` heading markdown (Verbatim Heading 4)
- **Bold**
- 1–2 sentences max
- Written as a strong declarative claim the card PROVES — not a description of what it says
- Think: what would you say on the flow? "Smith 25 — surveillance provides deterrence by detection"



### Good tag: `#### Surveillance systems provide deterrence by detection in the Arctic`



### Bad tag: `#### Smith discusses how surveillance relates to deterrence`

---



## Body Format

Four layers of emphasis, each nested inside the last — small connector prose is the default (nothing marked), and everything else narrows down from there:

- Paste the relevant excerpt **verbatim** — do NOT paraphrase, summarize, or alter the author's words
- **Underline** the passage kept as the cut, using `_underscores_` — the sentences/phrases pulled from the source and kept in the card at full size. Underline is NOT itself what gets read aloud: a debater only actually voices the highlighted words within it (below). Text left outside any underscores entirely is small/context — never read, never even kept at full size.
- **Highlight** the words the debater actually reads aloud, using `==double equals==` — must sit inside an underlined stretch. Concretely: the WARRANT (the specific mechanism/reasoning that makes the claim true, not just the bare assertion that it's true), any numbers/statistics/dates/magnitudes, and the load-bearing nouns/verbs/proper nouns the argument turns on. Skip grammatical connectors (a, the, of, to, in, on, that, and, or) — those aren't voiced either way. A well-cut card highlights MOST of its underlined text (most of what's kept IS read aloud), scattered across many short non-contiguous words/phrases, not one or two long blocks.
- **Box** — nested inside the highlight, using `**double asterisks**` — marks specific numbers and evidentiary statistics within the highlighted text, and otherwise whichever word or short phrase in a highlighted stretch is the single strongest point of emphasis. It isn't a pacing or delivery cue — just which content gets the most visual weight. Verified against a real cut card's underlying `.docx` XML: this is a bordered box (Word character style `w:bdr`, single-line, auto color) layered on top of underline + highlight — **not** literal bold text and **not** a literal double-underline, despite older drafts of this file describing it that way. Sparse: usually one box per highlighted stretch, sometimes none for a minor one. A box is 1–3 words, almost never a whole sentence.
- Cut aggressively — only include what's needed to prove the tag. Trim fat.
- When saving to library via save_card_to_library, the body must be clean verbatim text (no markdown underscores, equals signs, or asterisks)

See "Full Example Card" below for a real card demonstrating exactly where underline, highlight, and boxes land relative to each other.

---



## Verbatim Style Notes

All files should use **Verbatim** styles, not direct formatting. Key styles:

- **Analytic** — for written blocks/analytics; stripped from send doc automatically
- **Undertag** — for notes on a card; also stripped from send doc, doesn't appear in nav pane
- Never apply font/size/color directly to text — always modify via Verbatim > Settings > Styles

---



## Full Example Card

```
#### Surveillance systems provide deterrence by detection in the Arctic

Borsari and Davis 25 — Federico Borsari and Gordon B. Davis, Jr. December 16, 2025. Fellows at the Transatlantic Defense and Security Program and the Center for European Policy Analysis. CEPA, "High Stakes in the High North: Harnessing Uncrewed Capabilities for Arctic Defense and Security," https://cepa.org/commentary/high-stakes-in-the-high-north/

Deterrence in the Arctic greatly depends on situational awareness and signaling. _Drones can contribute to this key objective through what scholars have defined as "deterrence by detection," the notion that **persistent monitoring of adversary activity complicates their freedom of maneuver** and raises the costs of covert or coercive actions._ In practice, this means tracking Russian submarine patrols, monitoring aircraft flights across the Barents and Bering Seas, and detecting changes in Arctic force posture. _**Overall, multi-domain situational awareness is by far the top priority for Arctic allies given the ISR gap and increased Russian and Chinese activity in the region.**_
```

This older example predates the highlight layer being documented above — it only shows underline (`_..._`) and box (`**...**`) directly nested, with no highlight in between. The example below is pulled verbatim from a real cut card's `.docx` (body text only changed by adding the markdown markers) and shows all three layers together, which is the standard to match going forward.

### Worked example — underline, highlight, and box together

```
#### The Golden Dome undermines the nuclear order.

Horovitz & Süß 25 — *researcher in SWP's International Security Research Division, **researcher in SWP's International Security Research Division (*Liviu Horovitz, **Juliana Süß, 2025, "'Golden Dome' and the Illusory Promise of Invulnerability," SWP, https://www.swp-berlin.org/en/publication/golden-dome-and-the-illusory-promise-of-invulnerability) X13

Moreover, _the US government's open ==pursuit of **nuclear invulnerability**== through missile defense systems ==risks casting **doubt** on==_ the _==**diplomatic credibility**==_ of its Western allies. At international fora, _==Western allies present themselves as **responsible**== nuclear actors committed to ==preserving the== existing ==**nuclear order**==_ – in contrast with the revisionist and destructive behavior of Beijing and, in particular, Moscow. _==But this posture is **harder**== to maintain ==if Washington appears== willing to employ space-based systems_ for its own protection and thereby seeks _to ==**undermine** the deterrent== capabilities ==of other states==_; and it becomes even harder if US allies themselves support this stance.
```

What to notice:

- Underline comes in **islands**, not one continuous block — "Moreover,", the lone " the " before "diplomatic credibility", the Beijing/Moscow contrast clause, and the "for its own protection and thereby seeks" clause are all left as plain connector prose (context only, never read aloud), even though they sit in the middle of the paragraph.
- "diplomatic credibility" is its own tiny underline+highlight+box island, three words long, surrounded on both sides by unmarked prose — a box does not need a long underlined sentence around it to exist.
- Within a highlighted stretch, the box is almost always a single word or a very short phrase ("nuclear invulnerability", "doubt", "responsible", "harder", "undermine") — never the whole highlighted clause.
- Highlight has gaps too: inside `_the US government's open ==pursuit of **nuclear invulnerability**== through missile defense systems ==risks casting **doubt** on==_`, the phrase "through missile defense systems" is underlined but NOT highlighted — it stays in the card at full size as part of the cut, but a debater reading this card out loud skips straight past it to the next highlighted stretch.

---



## Workflow

1. **If given a URL**: call `fetch_article` to get the text, then proceed
2. **If given raw text**: use it directly
3. Find the 1–5 sentences that most directly prove a debate argument. Prefer specific, empirical claims over vague generalizations.
4. Write the tag as a bold declarative claim
5. Write the cite per the exact rules above
6. Format the body with underline, highlight, and box markers
7. Output: Tag → Cite → Body
8. Offer to save with `save_card_to_library`

---



## Tips

- If the user gives a long article and says "cut cards on X", find ALL relevant passages and cut multiple cards
- If the author's credentials aren't in the excerpt, note "quals unknown" and continue
- When in doubt on a time-sensitive date: ask the user for the exact publish date
- Always trim the body to just what proves the tag — don't paste the whole article
- For `save_card_to_library`: tag = plain text (no ####), body = clean verbatim (no underscores, highlight, or box markers), year = 4-digit integer

