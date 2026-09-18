// Core types for a cut debate card — ported from Warroom's src/types.ts.
// A card body is a string of verbatim source text; CardRun[] layers debate
// emphasis (underline/highlight/box/small) on top without ever changing the text.

export type HighlightColor = 'yellow' | 'cyan' | 'green';

// Debate font sizes: 11 = normal card body, 8 = standard Verbatim "small text"
// (kept for context, not read), 6 = smaller, 3 = smallest/nearly invisible.
export type FontSize = 11 | 8 | 6 | 3;

export interface CardRun {
  text: string;
  // the "cut" — the passage kept from the source, at full size. NOT itself
  // read aloud: a debater only voices the highlighted words within it (see
  // `highlight` below); everything underlined-but-unhighlighted stays in the
  // card, full size, but is skipped when actually speaking.
  underline?: boolean;
  highlight?: HighlightColor;   // what actually gets read aloud, within the underlined cut
  // A bordered box on a key word/phrase or number — real Verbatim docx's
  // "Emphasis" character style (underline + a `w:bdr` border), confirmed
  // against actual cut cards' XML. Independent of highlight: it may sit on a
  // highlighted word or on underlined-but-unhighlighted text, but is always
  // underlined. Always shown regardless of the highlight-density slider,
  // same as underline — not an extra density tier.
  box?: boolean;
  fontSize?: FontSize;          // omit/11 = normal; 8/6/3 = shrunk context NOT read aloud
}

export interface CardImage {
  src: string;   // data: URL (inlined) or remote http(s) URL
  alt?: string;
}

export interface Card {
  id: string;
  tag: string;
  cite: string;
  body: string;
  bodyRuns: CardRun[];
  images?: CardImage[];
  year: number;
  createdAt: string;
}

// ─── Card cutter (guided cut from a PDF or a saved web page) ────────────────

export interface CutterImage {
  src: string;
  alt?: string;
  suggested?: boolean; // Warroom AI thinks this image is genuinely part of the article
}

export interface CutterSource {
  ok: boolean;
  error?: string;
  kind: 'pdf' | 'html';
  cite: string;
  author: string;
  title: string;
  year: number;
  url: string;
  paragraphs: string[];
  images: CutterImage[];
}

// tier 1 = single most essential highlight (always shown, even at the lowest
// density); 2 = adds standard supporting emphasis; 3 = adds full/maximal emphasis.
export interface HighlightSpan { text: string; tier: 1 | 2 | 3; }

export interface CutterEmphasis {
  ok: boolean;
  error?: string;
  question?: AIQuestion;
  taglines: string[];
  underline: string[];
  highlight: HighlightSpan[];
  // Key words/phrases/numbers that get a bordered box (always underlined too);
  // may or may not also be highlighted. See CardRun.box.
  box: string[];
  small: string[];
}

export interface AIQuestion {
  question: string;
  options: string[];
}

export interface AIClarification {
  question: string;
  answer: string;
}

export type AIQuestionOr<T> = T | { question: AIQuestion };

// ─── AI provider settings (bring-your-own-key) ──────────────────────────────
// Gemini and Anthropic both allow direct browser calls (see platform/ai.ts);
// LM Studio runs on the user's own machine, reachable from a browser tab over
// localhost. OpenAI and xAI were dropped — their chat-completions APIs don't
// send CORS headers for a browser origin, so they never actually worked here.

export type AIProvider = 'gemini' | 'anthropic' | 'lmstudio';
