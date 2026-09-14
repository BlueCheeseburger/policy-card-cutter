// Core types for a cut debate card — ported from Warroom's src/types.ts.
// A card body is a string of verbatim source text; CardRun[] layers debate
// emphasis (underline/highlight/small) on top without ever changing the text.

export type HighlightColor = 'yellow' | 'cyan' | 'green';

// Debate font sizes: 11 = normal card body, 8 = standard Verbatim "small text"
// (kept for context, not read), 6 = smaller, 3 = smallest/nearly invisible.
export type FontSize = 11 | 8 | 6 | 3;

export interface CardRun {
  text: string;
  underline?: boolean;          // the "cut" — read aloud
  highlight?: HighlightColor;   // emphasis on top of underline — most important read words
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

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'grok';

export interface ProviderSettings {
  provider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
}
