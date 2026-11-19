import { useEffect, useState } from 'react';
import type { Constraints } from '@/api';
import { useCatalog, useUpdateConstraints } from '@/lib/queries';
import { Toggle, useToast } from '@/components/ui';
import { TagInput } from '../NewProjectPage';
import { useProjectCtx } from './ProjectLayout';

export function SettingsPage() {
  const { project: p } = useProjectCtx();
  const catalog = useCatalog();
  const save = useUpdateConstraints(p.id);
  const toast = useToast();
  const [c, setC] = useState<Constraints>(p.constraints);
  useEffect(() => setC(p.constraints), [p.constraints]);
  const dirty = JSON.stringify(c) !== JSON.stringify(p.constraints);
  const set = <K extends keyof Constraints>(k: K, v: Constraints[K]) => setC({ ...c, [k]: v });

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="card card-pad stack">
        <h3>Spec</h3>
        <dl className="kv">
          <dt>Objective</dt><dd>{p.spec.objective}</dd>
          <dt>Label</dt><dd>{p.spec.label}</dd>
          <dt>Unit of scoring</dt><dd>{p.spec.unitOfScoring}</dd>
          <dt>Population</dt><dd>{p.spec.population}</dd>
          <dt>Primary metric</dt><dd>{p.spec.primaryMetric}</dd>
          <dt>Secondary</dt><dd>{p.spec.secondaryMetrics.join(', ')}</dd>
          <dt>Time split</dt><dd>Train {p.spec.timeSplit.train} · validate {p.spec.timeSplit.validate} · out of time {p.spec.timeSplit.outOfTime}</dd>
        </dl>
      </div>
      <form className="card card-pad stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); save.mutate(c, { onSuccess: () => toast('Constraints saved. Agents use them from their next step.') }); }}>
        <div className="row"><h3 className="grow">Constraints</h3><span className="faint xs mono">project/constraints.yaml</span></div>
        <div className="field">
          <span className="lbl">VisaNet tables</span>
          <div className="row" style={{ gap: 6 }}>
            {catalog.data?.map((t) => (
              <label key={t.name} className="chip mono" style={{ cursor: 'pointer', padding: '3px 9px' }}>
                <input type="checkbox" checked={c.tables.includes(t.name)} onChange={(e) => set('tables', e.target.checked ? [...c.tables, t.name] : c.tables.filter((x) => x !== t.name))} /> {t.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid g2">
          <div className="field"><label htmlFor="s-df">Data window from</label><input id="s-df" type="date" className="input" value={c.dataWindow.from} onChange={(e) => set('dataWindow', { ...c.dataWindow, from: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-dt">Data window to</label><input id="s-dt" type="date" className="input" value={c.dataWindow.to} onChange={(e) => set('dataWindow', { ...c.dataWindow, to: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="s-fw">Allowed aggregation windows</label><TagInput id="s-fw" values={c.featureWindows} onChange={(v) => set('featureWindows', v)} /></div>
        <div className="field"><label htmlFor="s-ex">Columns agents must not use</label><TagInput id="s-ex" values={c.excludedColumns} onChange={(v) => set('excludedColumns', v)} /></div>
        <div className="grid g3">
          <div className="field"><label htmlFor="s-mf">Max features</label><input id="s-mf" type="number" className="input" value={c.maxFeatures} onChange={(e) => set('maxFeatures', +e.target.value)} /></div>
          <div className="field"><label htmlFor="s-gpu">GPU-hour budget</label><input id="s-gpu" type="number" className="input" value={c.computeBudgetGpuHours} onChange={(e) => set('computeBudgetGpuHours', +e.target.value)} /></div>
          <div className="field"><label htmlFor="s-me">Max experiments</label><input id="s-me" type="number" className="input" value={c.maxExperiments} onChange={(e) => set('maxExperiments', +e.target.value)} /></div>
          <div className="field"><label htmlFor="s-es">Stop after N runs without gain</label><input id="s-es" type="number" className="input" value={c.earlyStopAfter} onChange={(e) => set('earlyStopAfter', +e.target.value)} /></div>
          <div className="field"><label htmlFor="s-lat">Max p99 latency (ms)</label><input id="s-lat" type="number" className="input" value={c.maxLatencyMs} onChange={(e) => set('maxLatencyMs', +e.target.value)} /></div>
          <div className="field"><label htmlFor="s-env">Lower environment</label><select id="s-env" className="select" value={c.deployTarget} onChange={(e) => set('deployTarget', e.target.value as 'dev' | 'uat')}><option value="dev">DEV</option><option value="uat">UAT</option></select></div>
        </div>
        <div className="row"><Toggle checked={c.requireExplainability} onChange={(v) => set('requireExplainability', v)} label="Require explanations" /><span className="small">Return reason codes with every score</span></div>
        <div className="row"><Toggle checked={c.requireApprovalBeforeDeploy} onChange={(v) => set('requireApprovalBeforeDeploy', v)} label="Ask before deploying" /><span className="small">Ask me before deploying</span></div>
        <div className="row"><span className="spacer" /><button type="button" className="btn ghost" disabled={!dirty} onClick={() => setC(p.constraints)}>Discard changes</button><button className="btn primary" disabled={!dirty || save.isPending}>Save constraints</button></div>
      </form>
    </div>
  );
}
