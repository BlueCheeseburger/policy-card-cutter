import React, { useMemo, useRef, useState } from 'react';
import type { Card, CutterSource, HighlightColor, AIClarification, AIQuestion } from '../types';
import AIQuestionPrompt from './AIQuestionPrompt';
import { LoadingState } from './Spinner';
import { FormattedBody } from './CardBody';
import { humanizeAiError } from '../providers/ai';
import { cutterReadSource, cutterEmphasize } from '../utils/cutter';
import { readSingleFile, readFolderSource } from '../utils/readSource';
import { buildAttrsFromSpans, runsFromAttrs, HIGHLIGHT_SWATCH } from '../utils/cardFormat';
import type { CharAttr, HighlightLevel } from '../utils/cardFormat';
import { exportCardToDocx, downloadBlob } from '../utils/docxExport';

const CURRENT_YEAR = new Date().getFullYear();

type Step = 'pick' | 'reading' | 'select' | 'cutting' | 'edit' | 'done';

const COLORS: HighlightColor[] = ['yellow', 'cyan', 'green'];

type CutResult = { underline: string[]; highlight: { text: string; tier: HighlightLevel }[]; small: string[] };

export default function CardCutter() {
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<CutterSource | null>(null);

  // selection (step 2) — paragraph-granularity: click to toggle whole paragraphs
  const [includedParas, setIncludedParas] = useState<Set<number>>(new Set());
  const [pickedImages, setPickedImages] = useState<Set<number>>(new Set());
  const [showPics, setShowPics] = useState(false);

  // intent + color
  const [intent, setIntent] = useState('');
  const [color, setColor] = useState<HighlightColor>('cyan');

  // editor
  const [editText, setEditText] = useState('');
  const [editAttrs, setEditAttrs] = useState<CharAttr[]>([]);
  const [cutResult, setCutResult] = useState<CutResult | null>(null);
  const [highlightLevel, setHighlightLevel] = useState<HighlightLevel>(2);
  const [taglines, setTaglines] = useState<string[]>([]);
  const [chosenTag, setChosenTag] = useState('');
  const [cite, setCite] = useState('');
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [refineText, setRefineText] = useState('');
  const [refining, setRefining] = useState(false);
  const [savedCard, setSavedCard] = useState<Card | null>(null);

  const [extraImages, setExtraImages] = useState<{ src: string; alt: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const sourceFolderRef = useRef<HTMLInputElement>(null);

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
      const result = { underline: res.underline, highlight: res.highlight, small: res.small };
      setEditText(bodyText);
      setEditAttrs(buildAttrsFromSpans(bodyText, result, color, 2));
      setCutResult(result);
      setHighlightLevel(2);
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
      const result = { underline: res.underline, highlight: res.highlight, small: res.small };
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

  async function handlePickedFile(file: File) {
    setFileName(file.name);
    setError('');
    setClarifications([]);
    setPendingQuestion(null);
    setPendingCut(null);
    setStep('reading');
    try {
      const raw = await readSingleFile(file);
      const src = await cutterReadSource(raw);
      if (!src?.ok || !src.paragraphs?.length) {
        setError('No readable article text was found in this file.');
        setStep('pick');
        return;
      }
      applySource(src);
    } catch (e: any) {
      setError(humanizeAiError(e?.message) || e?.message || 'Could not read this file.');
      setStep('pick');
    }
  }

  async function handlePickedFolder(files: FileList) {
    setFileName(files[0]?.webkitRelativePath?.split('/')[0] || 'saved page');
    setError('');
    setClarifications([]);
    setPendingQuestion(null);
    setPendingCut(null);
    setStep('reading');
    try {
      const raw = await readFolderSource(files);
      const src = await cutterReadSource(raw);
      if (!src?.ok || !src.paragraphs?.length) {
        setError('No readable article text was found in this folder.');
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
    setYear(src.year || CURRENT_YEAR);
    setIncludedParas(new Set());
    setPickedImages(new Set());
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
    return idxs.map((i) => source.paragraphs[i]).filter(Boolean).join('\n\n');
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

  function addImageFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExtraImages((prev) => [...prev, { src: reader.result as string, alt: file.name }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function save() {
    const tag = (chosenTag || 'Untitled card').trim();
    if (!editText.trim()) { setError('There is no card body to save. Go back and cut the card again.'); return; }
    const runs = runsFromAttrs(editText, editAttrs);
    const sourceImgs = source
      ? [...pickedImages].sort((a, b) => a - b).map((i) => ({ src: source.images[i].src, alt: source.images[i].alt }))
      : [];
    const allImgs = [...sourceImgs, ...extraImages];
    const yr = Number(year) || CURRENT_YEAR;
    const card: Card = {
      id: crypto.randomUUID(), tag, cite: cite.trim(), body: editText.trim(),
      bodyRuns: runs, images: allImgs.length ? allImgs : undefined,
      year: yr, createdAt: new Date().toISOString(),
    };
    setSavedCard(card);
    setStep('done');
  }

  function reset() {
    setStep('pick'); setError(''); setFileName(''); setSource(null);
    setIncludedParas(new Set()); setPickedImages(new Set()); setShowPics(false);
    setIntent(''); setEditText(''); setEditAttrs([]); setCutResult(null);
    setHighlightLevel(2); setTaglines([]); setChosenTag(''); setCite(''); setYear(CURRENT_YEAR);
    setRefineText(''); setExtraImages([]); setSavedCard(null); setPendingQuestion(null);
    setClarifications([]); setPendingCut(null);
  }

  async function copyCardText() {
    if (!savedCard) return;
    const text = `${savedCard.tag}\n${savedCard.cite}\n\n${savedCard.body}`;
    await navigator.clipboard.writeText(text);
  }

  async function downloadDocx() {
    if (!savedCard) return;
    const blob = await exportCardToDocx(savedCard);
    downloadBlob(blob, `${savedCard.tag.slice(0, 40).replace(/[^\w\- ]/g, '') || 'card'}.docx`);
  }

  type EditImg = { key: string; src: string; alt: string; isSource: boolean; srcIdx: number; extraIdx: number };
  const editImages = useMemo<EditImg[]>(() => {
    const sourceImgs: EditImg[] = source
      ? [...pickedImages].sort((a, b) => a - b).map((i) => ({ key: `s${i}`, isSource: true, srcIdx: i, extraIdx: -1, src: source.images[i].src, alt: source.images[i].alt || '' }))
      : [];
    const extra: EditImg[] = extraImages.map((img, ei) => ({ key: `e${ei}`, isSource: false, srcIdx: -1, extraIdx: ei, src: img.src, alt: img.alt }));
    return [...sourceImgs, ...extra];
  }, [pickedImages, extraImages, source]);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <div className="glass-elevated" style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Cut a card</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>{stepLabel(step)}</p>
          </div>
        </div>

        <div className="scroll-thin" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {error && (
            <div style={{ position: 'sticky', top: 0, zIndex: 10, marginBottom: 12, border: '1px solid rgb(var(--danger-rgb) / 0.3)', borderRadius: 6, background: 'rgb(var(--danger-rgb) / 0.06)', padding: 10, fontSize: 13, color: 'var(--danger)', display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
            </div>
          )}

          {step === 'pick' && (
            <div style={{ textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p>Save the article first, then import it:</p>
                <p style={{ color: 'var(--ink)' }}>
                  <strong>⌘S / Ctrl+S → save as "Webpage, Complete"</strong> so the images come too (pick the folder below),
                  or just save the single .html for text only — or <strong>Print → Save as PDF</strong>.
                </p>
                <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>The AI reads it, then you guide what goes into the card.</p>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="ai-glow-ring btn-primary" onClick={() => sourceFileRef.current?.click()}>Choose a file (.html or .pdf)…</button>
                <button className="ai-glow-ring btn" onClick={() => sourceFolderRef.current?.click()}>Choose a saved-page folder (with images)…</button>
              </div>
              <input ref={sourceFileRef} type="file" accept=".html,.htm,.xhtml,.mhtml,.mht,.pdf" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickedFile(f); e.target.value = ''; }} />
              <input ref={sourceFolderRef} type="file" {...({ webkitdirectory: 'true' } as any)} multiple style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.length) handlePickedFolder(e.target.files); e.target.value = ''; }} />
            </div>
          )}

          {step === 'reading' && (
            <div style={{ padding: '56px 0' }}>
              <LoadingState messages={[
                `Reading ${fileName}…`,
                'Pulling the cite and article body…',
                'Extracting images…',
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
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px' }}>
                  <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>Cite: </span>{source.cite}
                </div>
              )}
              <div className="scroll-thin" style={{ borderRadius: 6, border: '1px solid var(--line)', maxHeight: '34vh', overflowY: 'auto' }}>
                {source.paragraphs.map((para, i) => {
                  const on = includedParas.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => togglePara(i)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, lineHeight: 1.5,
                        border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', background: 'transparent',
                        ...(on ? { backgroundColor: 'var(--accent-soft)', boxShadow: 'inset 3px 0 0 var(--accent)', color: 'var(--ink)' } : { color: 'var(--ink)', opacity: 0.55 }),
                      }}
                    >
                      {para}
                    </button>
                  );
                })}
              </div>

              {source.images.length > 0 && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
                  <button style={{ width: '100%', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowPics((v) => !v)}>
                    <span>Pictures from the source ({source.images.length}) · {pickedImages.size} selected</span>
                    <span>{showPics ? '▲' : '▼'}</span>
                  </button>
                  {showPics && (
                    <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {source.images.map((img, i) => {
                        const on = pickedImages.has(i);
                        return (
                          <button
                            key={i}
                            onClick={() => setPickedImages((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                            style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, padding: 0, cursor: 'pointer' }}
                            title={img.alt || ''}
                          >
                            <img src={img.src} alt={img.alt || ''} style={{ width: '100%', height: 80, objectFit: 'cover', background: '#fff', display: 'block' }} />
                            {img.suggested && <span style={{ position: 'absolute', top: 2, left: 2, fontSize: 9, color: '#fff', padding: '0 4px', borderRadius: 3, background: 'var(--accent)' }}>suggested</span>}
                            {on && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 10, color: '#fff', padding: '0 4px', borderRadius: 3, background: 'var(--accent)' }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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
            <div style={{ padding: '56px 0' }}>
              <LoadingState messages={[
                'The AI is cutting the card…',
                'Selecting the most important sentences…',
                'Deciding what to underline and highlight…',
                'Shrinking the rest…',
              ]} />
            </div>
          )}

          {step === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Tag</label>
                {taglines.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {taglines.map((t, i) => (
                      <label key={i} style={{ display: 'flex', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name="tagline" checked={chosenTag === t} onChange={() => setChosenTag(t)} />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                )}
                <input className="input" style={{ fontWeight: 600 }} value={chosenTag} onChange={(e) => setChosenTag(e.target.value)} placeholder="Tag" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Cite</label>
                <input className="input" style={{ fontSize: 12 }} value={cite} onChange={(e) => setCite(e.target.value)} placeholder="Author, date, title, URL" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Year</span>
                  <input className="input" style={{ width: 90, fontSize: 12 }} type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || CURRENT_YEAR)} />
                </div>
              </div>

              <div>
                <label className="label">Card body <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink-faint)' }}>— verbatim from the source.</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Highlight density:</span>
                  <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--line)', overflow: 'hidden' }}>
                    {([1, 2, 3] as HighlightLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        style={{
                          padding: '5px 10px', fontSize: 12, border: 'none', cursor: 'pointer',
                          borderLeft: lvl !== 1 ? '1px solid var(--line)' : 'none',
                          ...(highlightLevel === lvl ? { backgroundColor: 'var(--accent)', color: '#fff' } : { color: 'var(--ink)', opacity: 0.55, background: 'transparent' }),
                        }}
                        onClick={() => applyHighlightLevel(lvl)}
                        disabled={!cutResult}
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
                </div>
                <div className="scroll-thin" style={{ fontSize: 14, color: 'var(--ink)', borderRadius: 6, border: '1px solid var(--line)', padding: 12, maxHeight: '34vh', overflowY: 'auto', userSelect: 'text' }}>
                  <FormattedBody runs={runsFromAttrs(editText, editAttrs)} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label">Change something? <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink-faint)' }}>Tell the AI what to fix.</span></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    placeholder="e.g. underline less, highlight the statistics, don't shrink the last paragraph"
                    value={refineText}
                    disabled={refining || !cutResult}
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runRefine(); }}
                  />
                  <button className="ai-glow-ring btn-primary" onClick={runRefine} disabled={refining || !refineText.trim() || !cutResult} title="Send this card back to the AI with your instructions">
                    {refining ? 'Refining…' : 'Refine'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="label">Images</label>
                  <button className="btn" style={{ fontSize: 11 }} onClick={() => fileInputRef.current?.click()} title="Add an image from your files">+ Add image…</button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={addImageFromFile} />
                {editImages.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {editImages.map((img) => (
                      <div key={img.key} style={{ position: 'relative' }}>
                        <img src={img.src} alt={img.alt} style={{ maxHeight: 96, borderRadius: 4, border: '1px solid var(--line)', objectFit: 'contain', background: '#fff' }} />
                        <button
                          style={{ position: 'absolute', top: -6, right: -6, fontSize: 10, background: 'var(--danger)', color: '#fff', width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer' }}
                          title="Remove image"
                          onClick={() => {
                            if (img.isSource) setPickedImages((prev) => { const n = new Set(prev); n.delete(img.srcIdx); return n; });
                            else setExtraImages((prev) => prev.filter((_, i) => i !== img.extraIdx));
                          }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>No images — click "+ Add image…" to attach one from your files.</p>
                )}
              </div>
            </div>
          )}

          {step === 'done' && savedCard && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Card cut and ready.</div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{savedCard.tag}</h3>
                <p style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', margin: '0 0 10px' }}>{savedCard.cite}</p>
                <div className="scroll-thin" style={{ fontSize: 14, borderRadius: 6, border: '1px solid var(--line)', padding: 12, maxHeight: '40vh', overflowY: 'auto' }}>
                  <FormattedBody runs={savedCard.bodyRuns} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={copyCardText}>Copy as text</button>
                <button className="btn" onClick={downloadDocx}>Download .docx</button>
                <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={reset}>Cut another card</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <button className="btn-primary" onClick={save}>Finish card</button>
              <button className="btn" onClick={() => setStep('select')}>← Back</button>
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
    case 'select': return 'Step 2 — choose the body & pictures, then tell the AI the plan';
    case 'cutting': return 'Cutting…';
    case 'edit': return 'Step 3 — review & fix the cut';
    case 'done': return 'Done';
  }
}
