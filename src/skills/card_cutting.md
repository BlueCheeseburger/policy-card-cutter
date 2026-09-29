# Card Cutting — Verbatim Format

Cut policy debate evidence cards from raw source material. Match the exact formatting conventions below — sourced from the UC Berkeley 2026 Verbatim formatting guide.

---

## Card Anatomy

Every card has three parts in this exact order:

1. **Tag** — debater's 1–2 sentence summary of the argument. Written as a declarative claim (what the card *proves*). Uses `####` heading markdown. Bold.
2. **Cite** — author info + publication details. Plain text, NOT bolded.
3. **Body** — the excerpt from the source, underlined; the words actually read aloud are further highlighted within it.

---

{{CITE_RULES}}

---

## Tag Format

- Use `####` heading markdown (Verbatim Heading 4)
- **Bold**
- 1–2 sentences max
- Written as a strong declarative claim the card PROVES — not a description of what it says
- Think: what would you say on the flow? "Smith 25 — surveillance provides deterrence by detection"
- A tag can use **underlines AND uppercase letters** to stress its key words — generally more underlines than caps. The two overlap freely: a capped word can be underlined and an underlined word can be capped. Mark an underlined part of the tag with `_..._`, e.g. `Surveillance _DETERS_ — _detection_ forces restraint`.



### Good tag: `#### Surveillance systems provide deterrence by detection in the Arctic`



### Bad tag: `#### Smith discusses how surveillance relates to deterrence`

---



## Body Format

Four layers of emphasis, each nested inside the last — small connector prose is the default (nothing marked), and everything else narrows down from there:

- Paste the relevant excerpt **verbatim** — do NOT paraphrase, summarize, or alter the author's words
- **Underline** the passage kept as the cut, using `_underscores_` — the sentences/phrases pulled from the source and kept in the card at full size. Underline is NOT itself what gets read aloud: a debater only actually voices the highlighted words within it (below). Text left outside any underscores entirely is small/context — never read, never even kept at full size. Underline ALWAYS covers more than what's highlighted — it always has context: the underlined-but-unhighlighted words in between are what make the highlighted words parse as an actual sentence (subjects, secondary verbs, connectors, articles), not wasted space.
- **Highlight** the words the debater actually reads aloud, using `==double equals==` — must sit inside an underlined stretch, and must never cover the ENTIRE underlined stretch with no gaps. Concretely: the WARRANT (the specific mechanism/reasoning that makes the claim true, not just the bare assertion that it's true), any numbers/statistics/dates/magnitudes, and the load-bearing nouns/verbs/proper nouns the argument turns on. Skip grammatical connectors (a, the, of, to, in, on, that, and, or) — those aren't voiced either way, and stay as the underline's surrounding context. A well-cut card highlights MOST of its underlined text (most of what's kept IS read aloud), scattered across many short non-contiguous words/phrases, not one or two long blocks — every stretch keeps some unhighlighted context around it.
- **Box** — using `**double asterisks**` — marks specific numbers and evidentiary statistics, and otherwise a key word or short phrase that deserves the strongest emphasis. It isn't a pacing or delivery cue — just which content gets the most visual weight. Verified against real cut cards' underlying `.docx` XML: this is a bordered box (Word character style `w:bdr`, single-line, auto color) whose style also carries its own underline — **not** a literal double-underline, despite older drafts of this file describing it that way. **Anything boxed is also bolded** — the app applies the bold automatically, so never add bold markers yourself. **Box is independent of highlight**: it must sit inside the underlined cut, but it can land on a highlighted word (the common case — the strongest word in a highlighted stretch) OR on underlined-but-unhighlighted text (a key term, name, or number worth emphasizing that isn't part of the tight highlighted read). Either way it is always underlined. Sparse; a box is 1–3 words, almost never a whole sentence.
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

### Worked example — box on text that isn't highlighted

Box does not require a highlight. In this real card, several boxed words sit in plain underlined (unhighlighted) text — still underlined, because a box is always on underlined text:

```
#### Trump cheats through multiple pathways. At worst, he'll call off the midterms.

_In July, ==he demanded== that ==**Texas** undergo== an unorthodox, mid-decade ==**redistricting**== that could net five **Republican House** seats in November_. California countered with a redistricting plan of its own...

_The ==**DOJ**== has ==demanded **unredacted** voter files from all== **50 **==**states**==_. _Twenty-three states and the District of Columbia have not complied_. No surprise, _==**Trump**== & Co. are ==suing== them_.

_**Voter **==**files**== are a ==critical== weapon ==for== _voter ==**suppression** and== **election **==**subversion**==_.
```

What to notice:

- "Republican House" and "50" are boxed but NOT highlighted — the debater is emphasizing a specific term/number that isn't part of the tight highlighted read, but it's still underlined (a box always is).
- Boxes also sit on highlighted words in the same paragraph ("Texas", "redistricting", "DOJ", "unredacted", "states") — the two cases mix freely inside one card.
- A boxed phrase can straddle both: "Voter files" is a box where "Voter" is unhighlighted and "files" is highlighted.

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

