import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Deployment, type InferenceError, type InferenceResponse } from '@/api';
import { useApproveDeployment, useDeployment, useExperiments } from '@/lib/queries';
import { fmtInt, timeAgo } from '@/lib/format';
import { AgentBadge, CodeBlock, Empty, Icon, LoadingBlock, useToast } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

const STAGES: [Deployment['status'], string, string][] = [
  ['awaiting_approval', 'Approval', 'You approve the selected model'],
  ['packaging', 'Package', 'Model and feature definitions bundled'],
  ['checking', 'Readiness checks', 'Performance, stability, latency, explanations'],
  ['deploying', 'Deploy', 'Endpoint created in the lower environment'],
  ['live', 'Live', 'Inference API ready to call'],
];

export function DeployPage() {
  const { project: p } = useProjectCtx();
  const dep = useDeployment(p.id);
  const exps = useExperiments(p.id);
  const approve = useApproveDeployment(p.id);
  const toast = useToast();
  const [view, setView] = useState<'status' | 'test' | 'api' | null>(null);

  if (dep.isLoading) return <div className="page"><LoadingBlock rows={6} /></div>;
  const d = dep.data;
  const head = (
    <div className="page-head">
      <div className="grow">
        <h2 style={{ fontSize: 20 }}>Deployment</h2>
        <p>The selected model is checked and deployed to {p.constraints.deployTarget.toUpperCase()}. Once it is live, test it with your own payloads. Production stays locked until model risk review.</p>
      </div>
    </div>
  );
  if (!d)
    return (
      <div className="page">
        {head}
        <div className="card"><Empty title="Nothing to deploy yet" action={<Link className="btn" to="../models">Open model lab</Link>}>Deployment starts when the model loop stops and the Researcher selects the best model.</Empty></div>
      </div>
    );

  const exp = exps.data?.find((e) => e.id === d.experimentId);
  const idx = STAGES.findIndex(([s]) => s === d.status);
  const live = d.status === 'live';
  const v = view ?? (live ? 'test' : 'status');

  return (
    <div className="page">
      {head}
      <div className="subtabs view-tabs" role="tablist">
        {live && <button role="tab" aria-selected={v === 'test'} onClick={() => setView('test')}>Test the API</button>}
        <button role="tab" aria-selected={v === 'status'} onClick={() => setView('status')}>{live ? 'Status and checks' : 'Status'}</button>
        {live && <button role="tab" aria-selected={v === 'api'} onClick={() => setView('api')}>API details</button>}
      </div>

      {v === 'test' && live && <TestConsole d={d} projectId={p.id} />}
      {v === 'api' && live && <ApiDetails d={d} />}
      {v === 'status' && (<>

      {d.status === 'awaiting_approval' && (
        <div className="callout" style={{ alignItems: 'center' }}>
          <AgentBadge agent="deployer" size={28} />
          <div className="grow">
            <b>Approve deployment of {d.modelVersion} to {d.environment.toUpperCase()}?</b>
            <div className="small muted">Run {exp?.index}, {exp?.modelFamily}, {exp?.metrics?.primary}% {p.spec.primaryMetric.toLowerCase()}. The Deployer runs readiness checks after you approve and stops if any check fails.</div>
          </div>
          <Link to="../models" className="btn sm">Review model</Link>
          <button className="btn gate" disabled={approve.isPending} onClick={() => approve.mutate(undefined, { onSuccess: () => toast('Approved. The Deployer is packaging the model.') })}>
            <Icon name="check" size={14} /> Approve and deploy
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>{d.modelVersion}</h3><span className="chip">{d.environment.toUpperCase()}</span>{d.status === 'live' ? <span className="pill good">Live</span> : <span className="pill deploy live">{STAGES[idx]?.[1]}</span>}</div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 0 }}>
          {STAGES.map(([s, t, desc], i) => {
            const state = d.status === 'live' || i < idx ? 'done' : i === idx ? 'cur' : 'todo';
            return (
              <div key={s} style={{ padding: '14px 16px', borderRight: i < STAGES.length - 1 ? '1px solid var(--line)' : 0, opacity: state === 'todo' ? 0.55 : 1 }}>
                <div className="row nowrap" style={{ gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, background: state === 'done' ? 'var(--deploy)' : 'transparent', color: state === 'done' ? '#fff' : state === 'cur' ? (s === 'awaiting_approval' ? 'var(--gate)' : 'var(--deploy)') : 'var(--fg-3)', border: state === 'done' ? 0 : `2px solid ${state === 'cur' ? (s === 'awaiting_approval' ? 'var(--gate)' : 'var(--deploy)') : 'var(--line-2)'}` }}>{state === 'done' ? '✓' : i + 1}</span>
                  <b className="small">{t}</b>
                </div>
                <div className="faint xs" style={{ marginTop: 4 }}>{desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {live && <Traffic d={d} />}

        <div className="card">
          <div className="card-head"><h3>Readiness checks</h3><Link className="btn sm ghost" to="../artifacts?path=deploy%2Freadiness_report.md">readiness_report.md</Link></div>
          <div className="card-pad stack" style={{ gap: 0, paddingTop: 4, paddingBottom: 4 }}>
            {d.checks.map((c) => (
              <div key={c.name} className="row nowrap" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <span className={`pill ${c.status === 'pass' ? 'good' : c.status === 'warn' ? 'warn' : c.status === 'fail' ? 'bad' : 'neutral'}`} style={{ minWidth: 56, justifyContent: 'center' }}>{c.status === 'pending' ? 'Pending' : c.status === 'pass' ? 'Pass' : c.status === 'warn' ? 'Warn' : 'Fail'}</span>
                <div><div style={{ fontWeight: 500 }}>{c.name}</div><div className="faint small">{c.detail}</div></div>
              </div>
            ))}
          </div>
        </div>
      </>)}
    </div>
  );
}

interface HistoryItem { at: string; payload: string; res: InferenceResponse | InferenceError }

function Traffic({ d }: { d: Deployment }) {
  return (
    <div className="grid g4">
      <div className="card kpi"><span className="l">Requests, last hour</span><span className="v">{fmtInt(d.traffic?.requestsLastHour ?? 0)}</span></div>
      <div className="card kpi"><span className="l">p50 latency</span><span className="v">{d.traffic?.p50Ms} ms</span></div>
      <div className="card kpi"><span className="l">p99 latency</span><span className="v">{d.traffic?.p99Ms} ms</span></div>
      <div className="card kpi"><span className="l">Error rate</span><span className="v">{d.traffic?.errorRatePct}%</span></div>
    </div>
  );
}

function ApiDetails({ d }: { d: Deployment }) {
  return (
    <>
      <div className="card card-pad stack">
        <div className="row"><h3 className="grow">Inference API</h3><span className="faint xs">Live since {d.liveAt ? timeAgo(d.liveAt) : 'now'}</span></div>
        <CodeBlock label="Endpoint" code={`POST ${d.endpoint}`} />
        <CodeBlock label="Call it from code" code={`curl -X POST ${d.endpoint} \\\n  -H "Authorization: Bearer $MLSTUDIO_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(d.samplePayload)}'`} />
      </div>
      <div className="card">
          <div className="card-head"><h3>Request schema</h3><Link className="btn sm ghost" to="../artifacts?path=deploy%2Finference_api.md">inference_api.md</Link></div>
          <div className="tbl-wrap">
            <table className="t">
              <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
              <tbody>{d.inputSchema.map((f) => <tr key={f.name}><td className="mono">{f.name}{f.required && <span style={{ color: 'var(--bad)' }}> *</span>}</td><td className="faint">{f.type}</td><td>{f.description}</td></tr>)}</tbody>
            </table>
          </div>
      </div>
    </>
  );
}

function TestConsole({ d, projectId }: { d: Deployment; projectId: string }) {
  const sample = JSON.stringify(d.samplePayload, null, 2);
  const [body, setBody] = useState(sample);
  const [busy, setBusy] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const last = history[0];
  useEffect(() => setBody(sample), [sample]);

  async function send() {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      setParseErr(`The payload is not valid JSON: ${(e as Error).message}`);
      return;
    }
    setParseErr(null);
    setBusy(true);
    const res = await api.invoke(projectId, payload);
    setHistory((h) => [{ at: new Date().toISOString(), payload: body, res }, ...h].slice(0, 10));
    setBusy(false);
  }

  return (
    <>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Test payload</h3><button className="btn sm ghost" onClick={() => setBody(sample)}>Reset to sample</button></div>
          <div className="card-pad stack">
            <textarea className="textarea code-input" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} aria-label="Request payload (JSON)" />
            {parseErr && <div className="callout warn small" role="alert">{parseErr}</div>}
            <div className="row"><span className="faint xs grow">Feature values are looked up from the Feature Store using the keys in the payload.</span><button className="btn primary" onClick={send} disabled={busy}><Icon name="send" size={14} /> {busy ? 'Sending…' : 'Send request'}</button></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Response</h3>{last && 'latencyMs' in last.res && <span className="faint xs num">{last.res.latencyMs} ms</span>}</div>
          <div className="card-pad">
            {!last && <div className="empty small">Send a request to see the score, decision and reasons.</div>}
            {last && 'error' in last.res && <div className="callout warn" role="alert"><div><b>Request rejected.</b> {last.res.error}</div></div>}
            {last && 'score' in last.res && <ResponseView r={last.res} />}
          </div>
          {history.length > 1 && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ padding: '10px 18px 4px' }}>Earlier requests</div>
              {history.slice(1).map((h) => (
                <button key={h.at} className="row nowrap" style={{ width: '100%', border: 0, background: 'transparent', padding: '6px 18px', textAlign: 'left' }} onClick={() => setBody(h.payload)} title="Load this payload">
                  <span className="faint xs num">{new Date(h.at).toLocaleTimeString()}</span>
                  {'score' in h.res ? <><span className="mono small">{h.res.score.toFixed(3)}</span><span className="small muted ellipsis">{h.res.decision}</span></> : <span className="small" style={{ color: 'var(--bad)' }}>{h.res.error}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ResponseView({ r }: { r: InferenceResponse }) {
  const over = r.score >= r.threshold;
  const C = 2 * Math.PI * 48;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row nowrap" style={{ gap: 18 }}>
        <svg className="score-ring" viewBox="0 0 120 120" role="img" aria-label={`Score ${r.score}`}>
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--surface-3)" strokeWidth="12" />
          <circle cx="60" cy="60" r="48" fill="none" stroke={over ? 'var(--bad)' : 'var(--good)'} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(C * r.score).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 60 60)" />
          <text x="60" y="58" textAnchor="middle" style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 22, fill: 'var(--fg)' }}>{r.score.toFixed(2)}</text>
          <text x="60" y="76" textAnchor="middle" style={{ fontSize: 10, fill: 'var(--fg-3)' }}>threshold {r.threshold}</text>
        </svg>
        <div className="stack" style={{ gap: 6 }}>
          <span className={`pill ${over ? 'bad' : 'good'}`} style={{ alignSelf: 'flex-start', fontSize: 13 }}>{r.decision}</span>
          <span className="faint xs mono">{r.requestId} · {r.modelVersion}</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Top reasons</span>
        {r.reasons.map((x) => (
          <div key={x.feature} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 44px', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}><div className="small">{x.text}</div><div className="mono faint xs ellipsis">{x.feature}</div></div>
            <div className="bar"><i style={{ width: `${Math.min(100, x.contribution * 300)}%`, background: 'var(--deploy)' }} /></div>
            <span className="num xs faint" style={{ textAlign: 'right' }}>+{x.contribution.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <details>
        <summary className="small faint" style={{ cursor: 'pointer' }}>Raw response</summary>
        <pre className="code" style={{ marginTop: 8 }}>{JSON.stringify(r, null, 2)}</pre>
      </details>
    </div>
  );
}
