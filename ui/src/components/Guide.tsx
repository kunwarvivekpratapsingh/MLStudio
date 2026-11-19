import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './ui';

/* First-run walkthrough. Opens automatically once per browser, and from "How ML Studio works". */
const KEY = 'mlstudio.guide.seen';
let open = (() => { try { return !localStorage.getItem(KEY); } catch { return true; } })();
const subs = new Set<() => void>();
const set = (v: boolean) => {
  open = v;
  if (!v) { try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ } }
  subs.forEach((f) => f());
};
export function useGuide() {
  const isOpen = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => open);
  return { open: isOpen, show: () => set(true), hide: () => set(false) };
}

const STEPS = [
  { c: 'var(--accent)', k: 'Start', t: 'Describe the problem', d: 'Write the business problem in plain words, such as "too many genuine cross-border transactions are declined". ML Studio drafts the label, metric and VisaNet tables. You set the constraints: data window, latency, compute budget.', you: 'You write the problem and check the spec.' },
  { c: 'var(--features)', k: 'Loop 1', t: 'Agents engineer features', d: 'The Hypothesis agent proposes why the problem happens. Each hypothesis you accept is split into sub-hypotheses and turned into features, which are built on VFP within your constraints. Every step is written to hypothesis.md, sub_hypothesis.md and the feature catalog.', you: 'You accept or reject hypotheses.' },
  { c: 'var(--models)', k: 'Loop 2', t: 'Agents train and improve models', d: 'The Researcher runs experiments one after another. Each has its own hypothesis, training run and metrics. It keeps what helps and drops what does not, then picks the best model and explains why.', you: 'Nothing. Watch progress or pause it.' },
  { c: 'var(--deploy)', k: 'Loop 3', t: 'Deploy and test', d: 'The selected model is packaged, checked and deployed to a lower environment such as UAT. You get an inference API and can send test payloads from the UI.', you: 'You approve the deployment, then test it.' },
];

export function Guide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="scrim guide-scrim" onClick={onClose}>
      <div className="guide card" role="dialog" aria-modal="true" aria-label="How ML Studio works" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn guide-x" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        <div className="eyebrow">How ML Studio works</div>
        <div className="guide-track" aria-hidden="true">
          {STEPS.map((x, j) => (
            <button key={j} className={`guide-dot ${j === i ? 'on' : ''} ${j < i ? 'done' : ''}`} style={{ ['--c' as string]: x.c }} onClick={() => setI(j)} tabIndex={-1}>
              <span>{j < i ? '✓' : j + 1}</span><em>{x.t}</em>
            </button>
          ))}
        </div>
        <div className="guide-body" key={i}>
          <span className="pill" style={{ background: 'color-mix(in srgb, ' + s.c + ' 14%, transparent)', color: s.c }}>{s.k}</span>
          <h2>{s.t}</h2>
          <p className="muted">{s.d}</p>
          <div className="guide-you"><Icon name="check" size={15} /> <span><b>Your part:</b> {s.you}</span></div>
        </div>
        <div className="row">
          <span className="faint small grow">Step {i + 1} of {STEPS.length}</span>
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>}
          {!last && <button className="btn primary" onClick={() => setI(i + 1)}>Next <Icon name="arrow" size={14} /></button>}
          {last && <button className="btn" onClick={onClose}>Explore projects</button>}
          {last && <button className="btn primary" onClick={() => { onClose(); nav('/projects/new'); }}><Icon name="plus" size={14} /> Start a project</button>}
        </div>
      </div>
    </div>
  );
}
