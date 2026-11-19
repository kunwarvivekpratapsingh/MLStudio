import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Constraints, type ProblemSpec, type ProblemType } from '@/api';
import { useCatalog, useCreateProject } from '@/lib/queries';
import { PROBLEM_TYPES } from '@/lib/format';
import { AgentBadge, CodeBlock, Icon, Toggle, useToast } from '@/components/ui';

const EXAMPLES: { type: ProblemType; text: string }[] = [
  { type: 'false_decline', text: 'Issuers decline too many genuine recurring subscription payments after a card is reissued. Predict which declined recurring CNP authorizations are genuine so issuers can approve them, keeping fraud under 1 bp.' },
  { type: 'friendly_fraud', text: 'Disputes for “item not received” at digital-goods merchants are rising. Predict at dispute time which ones are first-party misuse so they can be routed to representment.' },
  { type: 'merchant_risk', text: 'Detect merchants whose CNP fraud rate is about to spike, at least 7 days ahead, so acquirers can intervene.' },
];

const STEPS = ['Problem', 'Spec and data', 'Constraints', 'Review'];

export function NewProjectPage() {
  const nav = useNavigate();
  const toast = useToast();
  const catalog = useCatalog();
  const create = useCreateProject();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ProblemType>('fraud');
  const [statement, setStatement] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState<ProblemSpec | null>(null);
  const [c, setC] = useState<Constraints | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function draft() {
    if (statement.trim().length < 30) {
      setErr('Describe the problem in a sentence or two (at least 30 characters) so the Orchestrator can draft a spec.');
      return;
    }
    setErr(null);
    setDrafting(true);
    try {
      const d = await api.draftSpec({ statement, problemType: type });
      setName(d.name);
      setSpec(d.spec);
      setC(d.constraints);
      setStep(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Drafting failed. Try again.');
    } finally {
      setDrafting(false);
    }
  }

  async function submit(start: boolean) {
    if (!spec || !c) return;
    const p = await create.mutateAsync({ name: name.trim() || 'Untitled project', problemType: type, statement, spec, constraints: c, start });
    toast(start ? 'Project created. The Hypothesis agent is starting.' : 'Saved as a draft.');
    nav(`/projects/${p.id}`);
  }

  const setS = (k: keyof ProblemSpec, v: string) => spec && setSpec({ ...spec, [k]: v });
  const setT = (k: keyof ProblemSpec['timeSplit'], v: string) => spec && setSpec({ ...spec, timeSplit: { ...spec.timeSplit, [k]: v } });
  const setCK = <K extends keyof Constraints>(k: K, v: Constraints[K]) => c && setC({ ...c, [k]: v });

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <div className="grow">
          <h1>New project</h1>
          <p>Start with the business problem in plain language. The Orchestrator drafts the spec and constraints; you review them before any agent touches data.</p>
        </div>
      </div>

      <div className="wizard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <div key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="n">{i < step ? '✓' : i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <div className="field">
            <span className="lbl">What kind of problem is it?</span>
            <div className="type-cards">
              {(Object.keys(PROBLEM_TYPES) as ProblemType[]).map((t) => (
                <button key={t} type="button" className="type-card" aria-pressed={type === t} onClick={() => setType(t)}>
                  <b>{PROBLEM_TYPES[t].label}</b>
                  <span>{PROBLEM_TYPES[t].blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="statement">Problem statement</label>
            <textarea id="statement" className="textarea" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="What is going wrong, for whom, and what decision should the model support? Include the business limit you must respect, such as a false-positive rate." style={{ minHeight: 150 }} />
            <span className="hint">Tip: name the decision the model supports and the limit it must respect. The agents use this to choose the label and metric.</span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Examples</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.text} type="button" className="btn ghost" style={{ whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start', fontWeight: 500 }} onClick={() => { setType(ex.type); setStatement(ex.text); }}>
                <span className="chip">{PROBLEM_TYPES[ex.type].label}</span> <span className="muted">{ex.text}</span>
              </button>
            ))}
          </div>
          {err && <div className="callout warn" role="alert">{err}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={draft} disabled={drafting}>
              {drafting ? <><AgentBadge agent="orchestrator" size={18} /> Orchestrator is drafting the spec…</> : <>Draft the spec <Icon name="arrow" size={15} /></>}
            </button>
          </div>
        </div>
      )}

      {step === 1 && spec && c && (
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <div className="callout info"><AgentBadge agent="orchestrator" size={24} /><div className="small">The Orchestrator drafted this spec from your statement. Every field is editable. The label and metric decide what “better” means for the model loop, so check them carefully.</div></div>
          <Field label="Project name" id="name"><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Objective" id="obj"><input id="obj" className="input" value={spec.objective} onChange={(e) => setS('objective', e.target.value)} /></Field>
          <Field label="Label (what counts as a positive)" id="label"><textarea id="label" className="textarea" style={{ minHeight: 64 }} value={spec.label} onChange={(e) => setS('label', e.target.value)} /></Field>
          <div className="grid g2">
            <Field label="Unit of scoring" id="unit"><input id="unit" className="input" value={spec.unitOfScoring} onChange={(e) => setS('unitOfScoring', e.target.value)} /></Field>
            <Field label="Primary metric" id="metric"><input id="metric" className="input" value={spec.primaryMetric} onChange={(e) => setS('primaryMetric', e.target.value)} /></Field>
          </div>
          <Field label="Population" id="pop"><input id="pop" className="input" value={spec.population} onChange={(e) => setS('population', e.target.value)} /></Field>
          <div className="grid g3">
            <Field label="Train" id="tr"><input id="tr" className="input" value={spec.timeSplit.train} onChange={(e) => setT('train', e.target.value)} /></Field>
            <Field label="Validate" id="va"><input id="va" className="input" value={spec.timeSplit.validate} onChange={(e) => setT('validate', e.target.value)} /></Field>
            <Field label="Out of time" id="oot"><input id="oot" className="input" value={spec.timeSplit.outOfTime} onChange={(e) => setT('outOfTime', e.target.value)} /></Field>
          </div>
          <div className="field">
            <span className="lbl">VisaNet tables the agents may use</span>
            <div className="grid g2" style={{ gap: 4 }}>
              {catalog.data?.map((t) => (
                <label key={t.name} className="check-row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.tables.includes(t.name)} onChange={(e) => setCK('tables', e.target.checked ? [...c.tables, t.name] : c.tables.filter((x) => x !== t.name))} />
                  <span><span className="mono">{t.name}</span><br /><span className="faint xs">{t.description} · {t.rows} rows</span></span>
                </label>
              ))}
            </div>
          </div>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!c.tables.length} />
        </div>
      )}

      {step === 2 && c && (
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <p className="muted small">These constraints are written to <span className="mono">constraints.yaml</span>. The Feature engineer and VFP builder must respect them, and the model loop stops when it hits the budget.</p>
          <h3>Feature engineering</h3>
          <div className="grid g2">
            <Field label="Data window from" id="df"><input id="df" type="date" className="input" value={c.dataWindow.from} onChange={(e) => setCK('dataWindow', { ...c.dataWindow, from: e.target.value })} /></Field>
            <Field label="Data window to" id="dt"><input id="dt" type="date" className="input" value={c.dataWindow.to} onChange={(e) => setCK('dataWindow', { ...c.dataWindow, to: e.target.value })} /></Field>
          </div>
          <Field label="Allowed aggregation windows" id="fw" hint="Press Enter to add, for example 1h, 7d, 90d"><TagInput id="fw" values={c.featureWindows} onChange={(v) => setCK('featureWindows', v)} /></Field>
          <Field label="Columns agents must not use" id="ex" hint="For example unstable or sensitive fields"><TagInput id="ex" values={c.excludedColumns} onChange={(v) => setCK('excludedColumns', v)} /></Field>
          <Field label="Maximum number of features" id="mf"><input id="mf" type="number" min={5} className="input" value={c.maxFeatures} onChange={(e) => setCK('maxFeatures', +e.target.value)} /></Field>
          <div className="divider" />
          <h3>Model loop</h3>
          <div className="grid g3">
            <Field label="Compute budget (GPU-hours)" id="gpu"><input id="gpu" type="number" min={1} className="input" value={c.computeBudgetGpuHours} onChange={(e) => setCK('computeBudgetGpuHours', +e.target.value)} /></Field>
            <Field label="Maximum experiments" id="me"><input id="me" type="number" min={5} className="input" value={c.maxExperiments} onChange={(e) => setCK('maxExperiments', +e.target.value)} /></Field>
            <Field label="Stop after N runs without gain" id="es"><input id="es" type="number" min={3} className="input" value={c.earlyStopAfter} onChange={(e) => setCK('earlyStopAfter', +e.target.value)} /></Field>
          </div>
          <div className="grid g2">
            <Field label="Max scoring latency, p99 (ms)" id="lat"><input id="lat" type="number" min={1} className="input" value={c.maxLatencyMs} onChange={(e) => setCK('maxLatencyMs', +e.target.value)} /></Field>
            <div className="field"><span className="lbl">Explanations required</span><div className="row"><Toggle checked={c.requireExplainability} onChange={(v) => setCK('requireExplainability', v)} label="Explanations required" /><span className="small muted">Return reason codes with every score</span></div></div>
          </div>
          <div className="divider" />
          <h3>Deployment</h3>
          <div className="grid g2">
            <Field label="Lower environment" id="env">
              <select id="env" className="select" value={c.deployTarget} onChange={(e) => setCK('deployTarget', e.target.value as 'dev' | 'uat')}>
                <option value="dev">DEV</option>
                <option value="uat">UAT</option>
              </select>
            </Field>
            <div className="field"><span className="lbl">Ask me before deploying</span><div className="row"><Toggle checked={c.requireApprovalBeforeDeploy} onChange={(v) => setCK('requireApprovalBeforeDeploy', v)} label="Ask before deploying" /><span className="small muted">{c.requireApprovalBeforeDeploy ? 'The Deployer waits for your approval' : 'The Deployer deploys the selected model automatically'}</span></div></div>
          </div>
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && spec && c && (
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <h2>{name}</h2>
          <p className="muted">{statement}</p>
          <dl className="kv">
            <dt>Type</dt><dd>{PROBLEM_TYPES[type].label}</dd>
            <dt>Label</dt><dd>{spec.label}</dd>
            <dt>Primary metric</dt><dd>{spec.primaryMetric}</dd>
            <dt>Tables</dt><dd className="row" style={{ gap: 4 }}>{c.tables.map((t) => <span key={t} className="chip mono">{t}</span>)}</dd>
            <dt>Model loop</dt><dd>{c.computeBudgetGpuHours} GPU-hours, up to {c.maxExperiments} runs, stop after {c.earlyStopAfter} without gain</dd>
            <dt>Deploy</dt><dd>{c.deployTarget.toUpperCase()}, {c.requireApprovalBeforeDeploy ? 'after your approval' : 'automatically'}</dd>
          </dl>
          <CodeBlock label="Same project from Claude Code" code={`/mltc new --type ${type} --name "${name}" \\\n  --tables ${c.tables.join(',')} \\\n  --budget-gpu-hours ${c.computeBudgetGpuHours} --max-latency-ms ${c.maxLatencyMs} \\\n  --deploy ${c.deployTarget}${c.requireApprovalBeforeDeploy ? ' --approve-deploy' : ''} \\\n  --problem "${statement.slice(0, 80)}${statement.length > 80 ? '…' : ''}"`} />
          {create.error && <div className="callout warn" role="alert">{String(create.error)}</div>}
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
            <span className="spacer" />
            <button className="btn" onClick={() => submit(false)} disabled={create.isPending}>Save as draft</button>
            <button className="btn primary" onClick={() => submit(true)} disabled={create.isPending}><Icon name="play" size={14} /> Create and start</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="row">
      <button className="btn ghost" onClick={onBack}>Back</button>
      <span className="spacer" />
      <button className="btn primary" onClick={onNext} disabled={nextDisabled}>Continue <Icon name="arrow" size={15} /></button>
    </div>
  );
}
export function TagInput({ id, values, onChange }: { id: string; values: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="tag-input">
      {values.map((x) => (
        <span key={x} className="chip mono">{x}<button type="button" aria-label={`Remove ${x}`} onClick={() => onChange(values.filter((y) => y !== x))}>×</button></span>
      ))}
      <input
        id={id}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && v.trim()) {
            e.preventDefault();
            if (!values.includes(v.trim())) onChange([...values, v.trim()]);
            setV('');
          } else if (e.key === 'Backspace' && !v && values.length) onChange(values.slice(0, -1));
        }}
        placeholder={values.length ? '' : 'Type and press Enter'}
      />
    </div>
  );
}
