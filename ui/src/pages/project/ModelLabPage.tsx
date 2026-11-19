import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Experiment } from '@/api';
import { useExperiments, useModelStats, useSelection } from '@/lib/queries';
import { timeAgo } from '@/lib/format';
import { ExperimentChart } from '@/components/ExperimentChart';
import { AgentBadge, Bar, Drawer, Empty, Icon, LoadingBlock, Markdown } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

export function ModelLabPage() {
  const { project: p } = useProjectCtx();
  const exps = useExperiments(p.id);
  const stats = useModelStats(p.id);
  const selection = useSelection(p.id);
  const [selId, setSelId] = useState<string | null>(null);
  const [sort, setSort] = useState<'recent' | 'best'>('recent');
  const [onlyKept, setOnlyKept] = useState(false);
  const [view, setView] = useState<'progress' | 'experiments' | 'selected'>('progress');

  const list = useMemo(() => {
    let x = (exps.data ?? []).slice();
    if (onlyKept) x = x.filter((e) => e.outcome === 'kept');
    return sort === 'recent' ? x.reverse() : x.sort((a, b) => (b.metrics?.primary ?? -1) - (a.metrics?.primary ?? -1));
  }, [exps.data, sort, onlyKept]);

  if (exps.isLoading) return <div className="page"><LoadingBlock rows={8} /></div>;
  const all = exps.data ?? [];
  if (!all.length)
    return (
      <div className="page">
        <Head />
        <div className="card"><Empty title="The model loop hasn’t started">It starts automatically when the feature loop finishes and features are registered in the Feature Store.</Empty></div>
      </div>
    );

  const done = all.filter((e) => e.metrics);
  const best = done.filter((e) => e.outcome === 'kept').reduce((a, b) => (b.metrics!.primary >= a.metrics!.primary ? b : a));
  const training = all.find((e) => e.status === 'training');
  const chosen = selection.data ? all.find((e) => e.id === selection.data!.experimentId) : null;
  const sel = all.find((e) => e.id === selId) ?? null;

  return (
    <div className="page">
      <Head />
      <div className="subtabs view-tabs" role="tablist">
        <button role="tab" aria-selected={view === 'progress'} onClick={() => setView('progress')}>Progress</button>
        <button role="tab" aria-selected={view === 'experiments'} onClick={() => setView('experiments')}>Experiments <span className="num" style={{ opacity: 0.7 }}>{all.length}</span></button>
        {chosen && <button role="tab" aria-selected={view === 'selected'} onClick={() => setView('selected')}>Selected model</button>}
      </div>
      {view === 'progress' && (<>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-head">
            <h3>{p.spec.primaryMetric}, every run</h3>
            <span className="row xs faint" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: 'var(--models)' }} />Kept</span>
              <span className="row" style={{ gap: 5 }}><span className="dot" style={{ border: '1.3px solid var(--fg-3)' }} />Discarded</span>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 14, height: 2, background: 'var(--models)', display: 'inline-block' }} />Best so far</span>
            </span>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <ExperimentChart experiments={all} max={p.constraints.maxExperiments} selectedId={selId ?? undefined} onSelect={setSelId} />
          </div>
        </div>
        <div className="card card-pad stack" style={{ gap: 12, borderColor: 'color-mix(in srgb, var(--models) 35%, var(--line))' }}>
          <div className="row"><span className="eyebrow grow">{chosen ? 'Selected model' : 'Best so far'}</span><span className="pill models">run {(chosen ?? best).index}</span></div>
          <div>
            <div className="num" style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 800, color: 'var(--models)', lineHeight: 1 }}>{(chosen ?? best).metrics!.primary}%</div>
            <div className="small muted" style={{ marginTop: 4 }}>{p.spec.primaryMetric}</div>
          </div>
          <div className="small"><b>{(chosen ?? best).modelFamily}</b> · {(chosen ?? best).change}</div>
          <div className="divider" />
          <dl className="kv small" style={{ gridTemplateColumns: 'auto 1fr', gap: '6px 14px' }}>
            <dt>vs. baseline</dt><dd style={{ color: 'var(--good)', fontWeight: 600 }}>+{((chosen ?? best).metrics!.primary - done[0].metrics!.primary).toFixed(1)} pts</dd>
            <dt>AUC-PR</dt><dd className="num">{(chosen ?? best).metrics!.aucPr}</dd>
            <dt>p99 latency</dt><dd className="num">{(chosen ?? best).metrics!.latencyP99Ms} ms</dd>
            <dt>Features</dt><dd className="num">{(chosen ?? best).featureCount}</dd>
          </dl>
          {chosen && <Link to="../deploy" className="btn primary sm" style={{ alignSelf: 'flex-start' }}>Go to deployment <Icon name="arrow" size={13} /></Link>}
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        {chosen ? (
          <div className="card card-pad stack">
            <div className="row"><AgentBadge agent="researcher" size={26} /><h3 className="grow">The Researcher selected run {chosen.index}</h3></div>
            <p className="small muted">The loop has stopped. Read why this model was picked, then approve the deployment.</p>
            <div className="row"><button className="btn" onClick={() => setView('selected')}>Why this model</button><Link to="../deploy" className="btn primary">Go to deployment <Icon name="arrow" size={13} /></Link></div>
          </div>
        ) : (
          <div className="card card-pad stack">
            <div className="row"><AgentBadge agent="researcher" size={26} /><h3 className="grow">What the Researcher is doing</h3>{training && <span className="pill models live">Training</span>}</div>
            {training ? (
              <>
                <div className="small"><b>Run {training.index}:</b> {training.change}</div>
                <p className="small muted"><b style={{ color: 'var(--fg)' }}>Hypothesis.</b> {training.hypothesis}</p>
                <p className="faint xs">Started {timeAgo(training.startedAt!)} on the GPU pool.</p>
              </>
            ) : p.loops.models.status === 'paused' ? (
              <p className="small muted">The loop is paused. Resume it from the top of the page.</p>
            ) : (
              <p className="small muted">Reading the last result and planning the next run.</p>
            )}
          </div>
        )}
        <div className="card card-pad stack">
          <h3>Budget and stop rules</h3>
          {stats.data && (
            <>
              <Meter label="Compute" value={stats.data.gpuHoursUsed} max={stats.data.gpuHoursBudget} unit=" GPU-h" />
              <Meter label="Runs" value={all.length} max={stats.data.maxExperiments} unit="" />
              <Meter label="Runs since last improvement" value={stats.data.runsWithoutImprovement} max={stats.data.earlyStopAfter} unit="" warn />
              {stats.data.stopReason && <div className="callout good small"><div><b>Stopped.</b> {stats.data.stopReason}.</div></div>}
            </>
          )}
        </div>
      </div>

      </>)}

      {view === 'selected' && selection.data && chosen && (
          <div className="card card-pad stack">
            <div className="row"><AgentBadge agent="researcher" size={26} /><h3 className="grow">Why the Researcher picked run {chosen.index}</h3><Link className="btn sm ghost" to="../artifacts?path=models%2Fmodel_selection.md">model_selection.md</Link></div>
            <Markdown>{selection.data.rationale}</Markdown>
            <span className="eyebrow">Alternatives considered</span>
            {selection.data.alternatives.map((a) => {
              const e = all.find((x) => x.id === a.experimentId)!;
              return <div key={a.experimentId} className="row nowrap small"><button className="btn sm ghost" onClick={() => setSelId(e.id)}>Run {e.index}</button><span className="muted">{e.modelFamily}, {e.metrics?.primary}%. {a.reason}</span></div>;
            })}
          </div>
      )}

      {view === 'experiments' && (
      <div className="card">
        <div className="card-head">
          <h3>Experiments</h3>
          <span className="faint small">{all.length} runs · {all.filter((e) => e.outcome === 'kept').length} kept</span>
          <div className="subtabs">
            <button aria-selected={sort === 'recent'} onClick={() => setSort('recent')}>Most recent</button>
            <button aria-selected={sort === 'best'} onClick={() => setSort('best')}>Best first</button>
            <button aria-selected={onlyKept} onClick={() => setOnlyKept((v) => !v)}>Kept only</button>
          </div>
          <Link className="btn sm ghost" to="../artifacts?path=models%2Fexperiment_log.md">experiment_log.md</Link>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="t">
            <thead><tr><th>Run</th><th>Hypothesis and change</th><th>Model</th><th className="r">{p.spec.primaryMetric.split(' ')[0]}</th><th className="r">Δ best</th><th className="r">p99</th><th>Outcome</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={`click ${e.id === selId ? 'sel' : ''}`} onClick={() => setSelId(e.id)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setSelId(e.id)}>
                  <td className="mono faint">{String(e.index).padStart(3, '0')}</td>
                  <td style={{ minWidth: 280 }}><div style={{ fontWeight: 500 }}>{e.change}</div><div className="faint xs ellipsis" style={{ maxWidth: 520 }}>{e.hypothesis}</div></td>
                  <td><span className="chip">{e.modelFamily}</span></td>
                  <td className="r num">{e.metrics ? `${e.metrics.primary.toFixed(1)}%` : '—'}</td>
                  <td className="r num" style={{ color: (e.delta ?? 0) > 0 ? 'var(--good)' : 'var(--fg-3)', fontWeight: (e.delta ?? 0) > 0 ? 600 : 400 }}>{e.delta === undefined || e.index === 1 ? '—' : `${e.delta > 0 ? '+' : ''}${e.delta.toFixed(1)}`}</td>
                  <td className="r num faint">{e.metrics ? `${e.metrics.latencyP99Ms} ms` : '—'}</td>
                  <td>{e.status === 'training' ? <span className="pill deploy live">Training</span> : e.id === chosen?.id ? <span className="pill models">Selected</span> : e.outcome === 'kept' ? <span className="pill good">Kept</span> : <span className="pill neutral">Discarded</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {sel && <ExperimentDrawer e={sel} parent={all.find((x) => x.id === sel.parentId)} metric={p.spec.primaryMetric} onClose={() => setSelId(null)} />}
    </div>
  );
}

function Head() {
  return (
    <div className="page-head">
      <div className="grow">
        <h2 style={{ fontSize: 20 }}>Model lab</h2>
        <p>The Researcher tries one change per run and keeps it only if the model gets better. You don't need to do anything here.</p>
      </div>
    </div>
  );
}

function Meter({ label, value, max, unit, warn }: { label: string; value: number; max: number; unit: string; warn?: boolean }) {
  const r = value / max;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row small"><span className="grow muted">{label}</span><span className="num">{value}{unit} / {max}{unit}</span></div>
      <Bar value={r} color={warn && r > 0.7 ? 'var(--warn)' : 'var(--models)'} />
    </div>
  );
}

function ExperimentDrawer({ e, parent, metric, onClose }: { e: Experiment; parent?: Experiment; metric: string; onClose: () => void }) {
  return (
    <Drawer onClose={onClose} eyebrow={`Run ${e.index} · ${e.modelFamily}`} title={e.change}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">Researcher’s hypothesis</span>
        <p>{e.hypothesis}</p>
      </div>
      {e.metrics ? (
        <div className="grid g4">
          {[[metric.split(' ')[0], `${e.metrics.primary}%`], ['AUC-PR', e.metrics.aucPr], ['Precision', `${e.metrics.precisionAtThreshold}%`], ['p99', `${e.metrics.latencyP99Ms} ms`]].map(([l, v]) => (
            <div key={String(l)} className="card kpi" style={{ boxShadow: 'none' }}><span className="l">{l}</span><span className="v" style={{ fontSize: 19 }}>{v}</span></div>
          ))}
        </div>
      ) : <div className="callout info small"><div>Training now. Metrics appear when the run finishes.</div></div>}
      {e.conclusion && (
        <div className={`callout ${e.outcome === 'kept' ? 'good' : 'info'} small`}><AgentBadge agent="researcher" size={22} /><div><b>{e.outcome === 'kept' ? 'Kept.' : 'Discarded.'}</b> {e.conclusion}</div></div>
      )}
      <dl className="kv small">
        <dt>Parent run</dt><dd>{parent ? `Run ${parent.index} (${parent.metrics?.primary}%)` : 'None (baseline)'}</dd>
        <dt>Features used</dt><dd>{e.featureCount}</dd>
        <dt>GPU-hours</dt><dd className="num">{e.gpuHours}</dd>
        <dt>Finished</dt><dd>{e.finishedAt ? timeAgo(e.finishedAt) : 'Running'}</dd>
      </dl>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">Parameters</span>
        <table className="t" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
          <tbody>{Object.entries(e.params).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td className="mono">{String(v)}</td></tr>)}</tbody>
        </table>
      </div>
    </Drawer>
  );
}
