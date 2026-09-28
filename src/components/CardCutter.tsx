import { useMemo, useState } from 'react';
import type { Card, CutterSource, HighlightColor, AIClarification, AIQuestion } from '../types';
import AIQuestionPrompt from './AIQuestionPrompt';
import { LoadingState } from './Spinner';
import { CardView } from './CardBody';
import { humanizeAiError, cutterReadSource, cutterEmphasize } from '../platform/ai';
import { openFile } from '../platform/files';
import { readSettings } from '../platform/settings';
import { buildAttrsFromSpans, runsFromAttrs, plainTag, HIGHLIGHT_SWATCH } from '../utils/cardFormat';
import type { CharAttr, HighlightLevel } from '../utils/cardFormat';
import { condenseParagraphs } from '../utils/condense';
import { exportCardToDocx, downloadBlob } from '../utils/docxExport';

const CURRENT_YEAR = new Date().getFullYear();

type Step = 'pick' | 'reading' | 'select' | 'cutting' | 'edit';

const COLORS: HighlightColor[] = ['yellow', 'cyan', 'green'];

type CutResult = { underline: string[]; highlight: { text: string; tier: HighlightLevel }[]; box: string[] };

export default function CardCutter() {
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<CutterSource | null>(null);

  // selection (step 2) — paragraph-granularity: click to toggle whole paragraphs
  const [includedParas, setIncludedParas] = useState<Set<number>>(new Set());

  // intent + color — seeded from Settings' defaults, still changeable per cut.
  const [intent, setIntent] = useState('');
  const [color, setColor] = useState<HighlightColor>(() => readSettings().defaultHighlightColor ?? 'cyan');

  // editor
  const [editText, setEditText] = useState('');
  const [editAttrs, setEditAttrs] = useState<CharAttr[]>([]);
  const [cutResult, setCutResult] = useState<CutResult | null>(null);
  const [highlightLevel, setHighlightLevel] = useState<HighlightLevel>(() => readSettings().defaultHighlightLevel ?? 2);
  const [taglines, setTaglines] = useState<string[]>([]);
  const [chosenTag, setChosenTag] = useState('');
  const [cite, setCite] = useState('');
  const [refineText, setRefineText] = useState('');
  const [refining, setRefining] = useState(false);

  const [pendingQuestion, setPendingQuestion] = useState<AIQuestion | null>(null);
  const [clarifications, setClarifications] = useState<AIClarification[]>([]);
  const [pendingCut, setPendingCut] = useState<{ body: string; intent: string } | null>(null);
  const [answering, setAnswering] = useState(false);

  async function runEmphasize(bodyText: string, intentText: string, clars: AIClarification[]) {
    setPendingCut({ body: bodyText, intent: intentText });
    setPendingQuestion(null);
    setStep('cutting');
    setError('');
    try {
      const res = await cutterEmphasize({ body: bodyText, intent: intentText, cite, clarifications: clars });
      if (res.question) { setPendingQuestion(res.question); return; }
      const result = { underline: res.underline, highlight: res.highlight, box: res.box };
      const defaultLevel = readSettings().defaultHighlightLevel ?? 2;
      setEditText(bodyText);
      setEditAttrs(buildAttrsFromSpans(bodyText, result, color, defaultLevel));
      setCutResult(result);
      setHighlightLevel(defaultLevel);
      setTaglines(res.taglines || []);
      setChosenTag((res.taglines && res.taglines[0]) || '');
      setClarifications([]);
      setPendingCut(null);
      setRefineText('');
      setStep('edit');
    } catch (e: any) {
      setError(humanizeAiError(e?.message) || e?.message || 'Could not cut the card.');
      setStep('select');
    }
  }

  async function runRefine() {
    const instruction = refineText.trim();
    if (!instruction || !cutResult || refining) return;
    setRefining(true);
    setError('');
    try {
      const res = await cutterEmphasize({
        body: editText, intent, cite,
        refineInstruction: instruction, previous: cutResult,
      });
      if (res.question) {
        setError(`Warroom AI needs more detail to make that change: ${res.question.question}`);
        return;
      }
      const result = { underline: res.underline, highlight: res.highlight, box: res.box };
      setEditAttrs(buildAttrsFromSpans(editText, result, color, highlightLevel));
      setCutResult(result);
      if (res.taglines?.length) {
        setTaglines(res.taglines);
        if (!res.taglines.includes(chosenTag)) setChosenTag(res.taglines[0]);
      }
      setRefineText('');
    } catch (e: any) {
      setError(humanizeAiError(e?.message) || e?.message || 'Could not refine the card.');
    } finally {
      setRefining(false);
    }
  }

  async function answerQuestion(answer: string) {
    if (!pendingQuestion || !pendingCut || answering) return;
    setAnswering(true);
    const next = [...clarifications, { question: pendingQuestion.question, answer }];
    setClarifications(next);
    await runEmphasize(pendingCut.body, pendingCut.intent, next);
    setAnswering(false);
  }

  // Mirrors Warroom's `pickFile` → `window.warroom.dialog.openFile` →
  // `window.warroom.ai.cutterReadSource(filePath)` sequence exactly, except
  // the "path" is an opaque handle from platform/files.ts instead of a real
  // filesystem path — see platform/ai.ts's header comment for why.
  async function pickAndRead() {
    const handle = await openFile('.html,.htm,.xhtml,.mhtml,.mht,.pdf');
    if (!handle) return;
    setFileName(handle.split('/').pop() || 'source');
    setError('');
    setClarifications([]);
    setPendingQuestion(null);
    setPendingCut(null);
    setStep('reading');
    try {
      const src = await cutterReadSource(handle);
      if (!src?.ok || !src.paragraphs?.length) {
        setError(`No readable article text was found in this file.`);
        setStep('pick');
        return;
      }
      applySource(src);
    } catch (e: any) {
      setError(humanizeAiError(e?.message) || e?.message || 'Could not read this source.');
      setStep('pick');
    }
  }

  function applySource(src: CutterSource) {
    setSource(src);
    setCite(src.cite || '');
    setIncludedParas(new Set());
    setStep('select');
  }

  function togglePara(idx: number) {
    setIncludedParas((prev) => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  }

  // Selecting nothing means "use the whole article" rather than blocking the cut.
  const selectedBody = useMemo(() => {
    if (!source) return '';
    const idxs = includedParas.size
      ? [...includedParas].sort((a, b) => a - b)
      : source.paragraphs.map((_, i) => i);
    const s = readSettings();
    return condenseParagraphs(idxs.map((i) => source.paragraphs[i]), { paragraphIntegrity: s.paragraphIntegrity, usePilcrows: s.usePilcrows });
  }, [includedParas, source]);

  async function cut() {
    if (!selectedBody.trim()) return;
    await runEmphasize(selectedBody, intent, []);
  }

  function applyHighlightLevel(level: HighlightLevel) {
    if (!cutResult) return;
    setHighlightLevel(level);
    setEditAttrs(buildAttrsFromSpans(editText, cutResult, color, level));
  }

  function changeColor(c: HighlightColor) {
    setColor(c);
    if (cutResult) setEditAttrs(buildAttrsFromSpans(editText, cutResult, c, highlightLevel));
  }

  // The finished card, rebuilt live from the current cut/color/density.
  const card = useMemo<Card | null>(() => {
    if (step !== 'edit' || !editText) return null;
    return {
      id: 'current', tag: (chosenTag || 'Untitled card').trim(), cite: cite.trim(), body: editText.trim(),
      bodyRuns: runsFromAttrs(editText, editAttrs), year: source?.year || CURRENT_YEAR, createdAt: new Date().toISOString(),
    };
  }, [step, editText, editAttrs, chosenTag, cite, source]);

  function reset() {
    const defaults = readSettings();
    setStep('pick'); setError(''); setFileName(''); setSource(null);
    setIncludedParas(new Set());
    setIntent(''); setColor(defaults.defaultHighlightColor ?? 'cyan');
    setEditText(''); setEditAttrs([]); setCutResult(null);
    setHighlightLevel(defaults.defaultHighlightLevel ?? 2); setTaglines([]); setChosenTag(''); setCite('');
    setRefineText(''); setPendingQuestion(null);
    setClarifications([]); setPendingCut(null);
  }

  async function copyCardText() {
    if (!card) return;
    const text = `${plainTag(card.tag)}\n${card.cite}\n\n${card.body}`;
    await navigator.clipboard.writeText(text);
  }

  async function downloadDocx() {
    if (!card) return;
    const blob = await exportCardToDocx(card);
    downloadBlob(blob, `${plainTag(card.tag).slice(0, 40).replace(/[^\w\- ]/g, '') || 'card'}.docx`);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', padding: '32px 48px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, margin: 0 }}>Cut a card</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '6px 0 28px' }}>{stepLabel(step)}</p>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div style={{ position: 'sticky', top: 0, zIndex: 10, marginBottom: 12, border: '1px solid rgb(var(--danger-rgb) / 0.3)', borderRadius: 'var(--radius-sm)', background: 'rgb(var(--danger-rgb) / 0.06)', padding: 10, fontSize: 13, color: 'var(--danger)', display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
            </div>
          )}

          {step === 'pick' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16, fontSize: 14, color: 'var(--ink-muted)' }}>
              <p style={{ margin: 0 }}>Save the article first, then import it:</p>
              <p style={{ margin: 0, color: 'var(--ink)' }}>
                <strong>⌘S / Ctrl+S</strong> (.html or .mhtml) — or <strong>Print → Save as PDF</strong>.
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>The AI reads it, then you guide what goes into the card.</p>
              <button className="ai-glow-ring btn-primary" onClick={pickAndRead}>Choose a file (.html, .mhtml, or .pdf)…</button>
            </div>
          )}

          {step === 'reading' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LoadingState messages={[
                `Reading ${fileName}…`,
                'Pulling the cite and article body…',
                'Cleaning up the text…',
              ]} />
            </div>
          )}

          {step === 'select' && source && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Optional: click paragraphs to narrow the card to just those.</span>{' '}
                Leave everything unselected and the AI cuts from the whole article.
              </div>
              {source.cite && (
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>
                  <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Cite: </span>{source.cite}
                </div>
              )}
              <div className="scroll-thin" style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', maxHeight: '60vh', overflowY: 'auto' }}>
                {source.paragraphs.map((para, i) => {
                  const on = includedParas.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => togglePara(i)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, lineHeight: 1.5,
                        border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: 'transparent',
                        ...(on ? { backgroundColor: 'var(--accent-soft)', boxShadow: 'inset 3px 0 0 var(--accent)', color: 'var(--ink)' } : { color: 'var(--ink)', opacity: 0.55 }),
                      }}
                    >
                      {para}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                <label className="label">What are you using this card for? <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink-faint)' }}>(optional)</span></label>
                <textarea
                  className="input" rows={2}
                  placeholder="e.g. neg link card — surveillance trades off with deterrence"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Highlight color:</span>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${color === c ? 'var(--ink)' : 'transparent'}`, backgroundColor: HIGHLIGHT_SWATCH[c], cursor: 'pointer' }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'cutting' && pendingQuestion && (
            <div style={{ padding: '24px 0' }}>
              <AIQuestionPrompt question={pendingQuestion} onAnswer={answerQuestion} busy={answering} />
            </div>
          )}
          {step === 'cutting' && !pendingQuestion && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LoadingState messages={[
                'The AI is cutting the card…',
                'Selecting the most important sentences…',
                'Deciding what to underline and highlight…',
                'Shrinking the rest…',
              ]} />
            </div>
          )}

          {step === 'edit' && card && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Highlight density:</span>
                <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  {([1, 2, 3] as HighlightLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      style={{
                        padding: '5px 10px', fontSize: 12, border: 'none', cursor: 'pointer',
                        borderLeft: lvl !== 1 ? '1px solid var(--border-subtle)' : 'none',
                        ...(highlightLevel === lvl ? { backgroundColor: 'var(--accent)', color: '#fff' } : { color: 'var(--ink)', opacity: 0.55, background: 'transparent' }),
                      }}
                      onClick={() => applyHighlightLevel(lvl)}
                      title={lvl === 1 ? 'Only the most essential highlights' : lvl === 2 ? 'Standard highlighting' : 'Full, maximal highlighting'}
                    >
                      {lvl === 1 ? 'Less' : lvl === 2 ? 'Medium' : 'More'}
                    </button>
                  ))}
                </div>
                <span style={{ margin: '0 2px', color: 'var(--ink-faint)' }}>|</span>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Color:</span>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => changeColor(c)}
                    style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${color === c ? 'var(--ink)' : 'transparent'}`, backgroundColor: HIGHLIGHT_SWATCH[c], cursor: 'pointer' }} title={`Highlight in ${c}`} />
                ))}
                {taglines.length > 1 && (
                  <button className="btn" style={{ marginLeft: 'auto', fontSize: 12 }}
                    onClick={() => setChosenTag(taglines[(taglines.indexOf(chosenTag) + 1) % taglines.length])}
                    title="Swap to the AI's other tagline">
                    Use other tagline
                  </button>
                )}
              </div>

              <CardView card={card} />

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder="Change something? e.g. underline less, highlight the statistics, underline the last paragraph too"
                  value={refineText}
                  disabled={refining}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runRefine(); }}
                />
                <button className="ai-glow-ring btn-primary" onClick={runRefine} disabled={refining || !refineText.trim()} title="Send this card back to the AI with your instructions">
                  {refining ? 'Refining…' : 'Refine'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {step === 'select' && (
            <>
              <button className="ai-glow-ring btn-primary" disabled={!selectedBody.trim()} onClick={cut}
                title={includedParas.size ? `Cut from the ${includedParas.size} selected paragraph${includedParas.size === 1 ? '' : 's'}` : 'Cut from the whole article'}>
                Cut card →
              </button>
              <button className="btn" onClick={() => setIncludedParas(new Set())} disabled={!includedParas.size} title="Clear paragraph selection">Clear</button>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', marginLeft: 'auto' }}>
                {includedParas.size ? `${includedParas.size} paragraph${includedParas.size === 1 ? '' : 's'} selected` : 'Nothing selected — the whole article will be used'}
              </span>
            </>
          )}
          {step === 'edit' && (
            <>
              <button className="btn" onClick={() => setStep('select')}>← Back</button>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={copyCardText}>Copy as text</button>
              <button className="btn" onClick={downloadDocx}>Download .docx</button>
              <button className="btn-primary" onClick={reset}>Cut another card</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'pick': return 'Step 1 — import the source';
    case 'reading': return 'Reading the source…';
    case 'select': return 'Step 2 — choose the body, then tell the AI the plan';
    case 'cutting': return 'Cutting…';
    case 'edit': return 'Step 3 — review the cut, then copy or download it';
  }
}
