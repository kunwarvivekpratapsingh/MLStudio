import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Feature, FeatureBuildStatus, Hypothesis, SubHypothesis } from '@/api';
import { useFeatures, useHypotheses, useReviewHypothesis, useSubHypotheses, useVfpJobs } from '@/lib/queries';
import { fmtBig, timeAgo } from '@/lib/format';
import { AgentBadge, Bar, CodeBlock, Drawer, Empty, Icon, LoadingBlock, useToast } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

type Tab = 'hypotheses' | 'subs' | 'catalog' | 'vfp';

const BUILD: Record<FeatureBuildStatus, [string, string]> = {
  spec: ['neutral', 'Spec written'],
  queued: ['neutral', 'Queued'],
  building: ['accent live', 'Building'],
  validating: ['accent live', 'Validating'],
  ready: ['good', 'Ready'],
  failed: ['bad', 'Failed'],
  excluded: ['warn', 'Excluded'],
};

export function FeaturesPage() {
  const { project: p } = useProjectCtx();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'hypotheses';
  const hyps = useHypotheses(p.id);
  const subs = useSubHypotheses(p.id);
  const feats = useFeatures(p.id);
  const jobs = useVfpJobs(p.id);
  const setTab = (t: Tab) => setSp((s) => { s.set('tab', t); return s; }, { replace: true });

  const art: Record<Tab, string> = { hypotheses: 'features/hypothesis.md', subs: 'features/sub_hypothesis.md', catalog: 'features/feature_catalog.md', vfp: 'features/vfp_build_spec.yaml' };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <span className="eyebrow" style={{ color: 'var(--features)' }}>Loop 1 · Outer loop</span>
          <h2 style={{ fontSize: 20 }}>Feature engineering</h2>
          <p>The Hypothesis agent proposes why the problem happens. You accept or reject each hypothesis. Accepted ones are broken into sub-hypotheses, turned into features, and built on VFP within your constraints.</p>
        </div>
        <Link className="btn" to={`../artifacts?path=${encodeURIComponent(art[tab])}`}><Icon name="file" size={14} /> {art[tab].split('/')[1]}</Link>
      </div>

      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={tab === 'hypotheses'} onClick={() => setTab('hypotheses')}>Hypotheses <span className="num">{hyps.data?.length ?? ''}</span></button>
        <button role="tab" aria-selected={tab === 'subs'} onClick={() => setTab('subs')}>Sub-hypotheses <span className="num">{subs.data?.length ?? ''}</span></button>
        <button role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>Feature catalog <span className="num">{feats.data?.length ?? ''}</span></button>
        <button role="tab" aria-selected={tab === 'vfp'} onClick={() => setTab('vfp')}>VFP build {jobs.data?.some((j) => j.status === 'running') && <span className="dot pulse" style={{ background: 'var(--accent)', color: 'var(--accent)' }} />}</button>
      </div>

      {tab === 'hypotheses' && <HypothesesTab projectId={p.id} hyps={hyps.data} loading={hyps.isLoading} draft={p.status === 'draft'} />}
      {tab === 'subs' && <SubsTab hyps={hyps.data ?? []} subs={subs.data} />}
      {tab === 'catalog' && <CatalogTab hyps={hyps.data ?? []} subs={subs.data ?? []} feats={feats.data} jobsLoading={feats.isLoading} />}
      {tab === 'vfp' && <VfpTab jobs={jobs.data} feats={feats.data ?? []} />}
    </div>
  );
}

/* ---------------- Hypotheses ---------------- */
function HypothesesTab({ projectId, hyps, loading, draft }: { projectId: string; hyps?: Hypothesis[]; loading: boolean; draft: boolean }) {
  const review = useReviewHypothesis(projectId);
  const toast = useToast();
  if (loading) return <LoadingBlock rows={6} />;
  if (!hyps?.length)
    return (
      <div className="card">
        <Empty title={draft ? 'Start the project to generate hypotheses' : 'The Hypothesis agent is working'}>
          {draft ? 'Hypotheses appear here once the project starts.' : 'It is reading the problem statement and sampling VisaNet tables. Hypotheses appear here in a moment.'}
        </Empty>
      </div>
    );
  const proposed = hyps.filter((h) => h.status === 'proposed').length;
  return (
    <>
      {proposed > 0 && (
        <div className="callout">
          <AgentBadge agent="hypothesis" size={26} />
          <div className="grow small"><b>{proposed} hypothes{proposed === 1 ? 'is needs' : 'es need'} your decision.</b> Feature building starts once every hypothesis is accepted or rejected. Accept the ones worth building features for.</div>
        </div>
      )}
      <div className="grid g2">
        {hyps.map((h) => (
          <article key={h.id} className="card card-pad stack" style={{ borderColor: h.status === 'proposed' ? 'color-mix(in srgb, var(--gate) 45%, var(--line))' : undefined, gap: 10 }}>
            <div className="row">
              <span className="id-tag">{h.id}</span>
              <span className={`pill ${h.status === 'accepted' ? 'good' : h.status === 'rejected' ? 'neutral' : 'gate'}`}>{h.status === 'proposed' ? 'Needs decision' : h.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>
              <span className="spacer" />
              <span className="faint xs">Expected lift</span>
              <span className="row" style={{ gap: 2 }} aria-label={`Expected lift ${h.expectedLift} of 5`}>
                {[1, 2, 3, 4, 5].map((i) => <i key={i} style={{ width: 5, height: 12, borderRadius: 2, background: i <= h.expectedLift ? 'var(--features)' : 'var(--surface-3)' }} />)}
              </span>
            </div>
            <h3 style={{ fontSize: 15.5, lineHeight: 1.35 }}>{h.title}</h3>
            <p className="small muted">{h.rationale}</p>
            <div className="small" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '9px 11px' }}>
              <span className="eyebrow">Evidence</span>
              <div className="muted" style={{ marginTop: 2 }}>{h.evidence.split(/(\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith('**') ? <b key={i} style={{ color: 'var(--fg)' }}>{s.slice(2, -2)}</b> : s))}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>{h.tables.map((t) => <span key={t} className="chip mono">{t}</span>)}</div>
            <div className="row" style={{ marginTop: 'auto' }}>
              {h.status === 'proposed' ? (
                <>
                  <button className="btn sm primary" disabled={review.isPending} onClick={() => review.mutate({ id: h.id, status: 'accepted' }, { onSuccess: () => toast(`${h.id} accepted`) })}><Icon name="check" size={13} /> Accept</button>
                  <button className="btn sm" disabled={review.isPending} onClick={() => review.mutate({ id: h.id, status: 'rejected' }, { onSuccess: () => toast(`${h.id} rejected`) })}>Reject</button>
                </>
              ) : (
                <>
                  <span className="faint xs">{h.reviewedBy ? `${h.status === 'accepted' ? 'Accepted' : 'Rejected'} by ${h.reviewedBy}` : ''}</span>
                  <span className="spacer" />
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------------- Sub-hypotheses ---------------- */
function SubsTab({ hyps, subs }: { hyps: Hypothesis[]; subs?: SubHypothesis[] }) {
  if (!subs) return <LoadingBlock />;
  if (!subs.length) return <div className="card"><Empty title="No sub-hypotheses yet">The Sub-hypothesis agent breaks each accepted hypothesis into narrow, measurable claims.</Empty></div>;
  return (
    <div className="card">
      <div className="tbl-wrap">
        <table className="t">
          <thead><tr><th>ID</th><th>Sub-hypothesis</th><th>Measurable signal</th><th>Status</th></tr></thead>
          <tbody>
            {hyps.filter((h) => subs.some((s) => s.hypothesisId === h.id)).map((h) => (
              <FragmentRows key={h.id} h={h} subs={subs.filter((s) => s.hypothesisId === h.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function FragmentRows({ h, subs }: { h: Hypothesis; subs: SubHypothesis[] }) {
  return (
    <>
      <tr><td colSpan={4} style={{ background: 'var(--surface-2)', fontWeight: 600 }}><span className="id-tag" style={{ marginRight: 8 }}>{h.id}</span>{h.title}</td></tr>
      {subs.map((s) => (
        <tr key={s.id}>
          <td className="mono faint">{s.id}</td>
          <td style={{ minWidth: 220 }}>{s.title}</td>
          <td className="muted" style={{ minWidth: 200 }}>{s.signal}</td>
          <td><span className={`pill ${s.status === 'accepted' ? 'good' : 'gate'}`}>{s.status === 'accepted' ? 'Accepted' : 'Proposed'}</span></td>
        </tr>
      ))}
    </>
  );
}

/* ---------------- Catalog ---------------- */
function CatalogTab({ hyps, subs, feats, jobsLoading }: { hyps: Hypothesis[]; subs: SubHypothesis[]; feats?: Feature[]; jobsLoading: boolean }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Feature | null>(null);
  const filtered = useMemo(() => feats?.filter((f) => !q || f.name.includes(q.toLowerCase()) || f.description.toLowerCase().includes(q.toLowerCase())) ?? [], [feats, q]);
  if (jobsLoading) return <LoadingBlock rows={8} />;
  if (!feats?.length) return <div className="card"><Empty title="No features yet">Features appear once hypotheses are accepted and the Feature engineer has written their logic.</Empty></div>;
  return (
    <>
      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search features" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search features" />
        <span className="faint small">{feats.filter((f) => f.buildStatus === 'ready').length} ready · {feats.filter((f) => f.buildStatus === 'excluded').length} excluded · {feats.filter((f) => !['ready', 'excluded'].includes(f.buildStatus)).length} in progress</span>
      </div>
      <div className="card tree">
        {hyps.filter((h) => filtered.some((f) => f.hypothesisId === h.id)).map((h) => (
          <div key={h.id}>
            <div className="tree-h"><span className="id-tag">{h.id}</span><b className="grow">{h.title}</b></div>
            {subs.filter((s) => s.hypothesisId === h.id && filtered.some((f) => f.subHypothesisId === s.id)).map((s) => (
              <div key={s.id}>
                <div className="tree-s"><span className="id-tag">{s.id}</span><span className="grow small">{s.title} <span className="faint">· {s.signal}</span></span></div>
                {filtered.filter((f) => f.subHypothesisId === s.id).map((f) => (
                  <div key={f.id} className={`tree-f ${sel?.id === f.id ? 'sel' : ''}`} role="button" tabIndex={0} onClick={() => setSel(f)} onKeyDown={(e) => e.key === 'Enter' && setSel(f)}>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono ellipsis" style={{ fontWeight: 500 }}>{f.name}</div>
                      <div className="faint xs ellipsis">{f.description}</div>
                    </div>
                    <span className="faint xs num">{f.stats ? `IV ${f.stats.informationValue.toFixed(2)}` : f.window}</span>
                    <span className={`pill ${BUILD[f.buildStatus][0]}`}>{BUILD[f.buildStatus][1]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      {sel && <FeatureDrawer f={sel} h={hyps.find((h) => h.id === sel.hypothesisId)} s={subs.find((s) => s.id === sel.subHypothesisId)} onClose={() => setSel(null)} />}
    </>
  );
}

function FeatureDrawer({ f, h, s, onClose }: { f: Feature; h?: Hypothesis; s?: SubHypothesis; onClose: () => void }) {
  return (
    <Drawer onClose={onClose} eyebrow={`${f.hypothesisId} › ${f.subHypothesisId} · ${f.entity} · ${f.window}`} title={<span className="mono" style={{ fontSize: 16 }}>{f.name}</span>}>
      <p>{f.description}.</p>
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">Lineage</span>
        <div className="small stack" style={{ gap: 6 }}>
          <div className="row nowrap"><span className="pill features">{h?.id}</span><span>{h?.title}</span></div>
          <div className="row nowrap" style={{ paddingLeft: 18 }}><span className="pill neutral">{s?.id}</span><span>{s?.title}</span></div>
          <div className="row nowrap" style={{ paddingLeft: 36 }}><span className="pill accent">feature</span><span className="mono">{f.name}</span></div>
          {f.vfpJobId && <div className="row nowrap" style={{ paddingLeft: 54 }}><span className="pill neutral">VFP</span><span className="mono">{f.vfpJobId}</span></div>}
        </div>
      </div>
      {f.stats && (
        <div className="grid g4">
          {[['Info value', f.stats.informationValue.toFixed(2)], ['Coverage', `${f.stats.coveragePct}%`], ['PSI', f.stats.psi.toFixed(2)], ['Leakage', f.stats.leakage]].map(([l, v]) => (
            <div key={l} className="card kpi" style={{ boxShadow: 'none' }}><span className="l">{l}</span><span className="v" style={{ fontSize: 19 }}>{v}</span></div>
          ))}
        </div>
      )}
      {f.stats?.leakageNote && <div className="callout warn small"><div><b>Validator note.</b> {f.stats.leakageNote}</div></div>}
      {f.excludedReason && <div className="callout warn small"><div><b>Excluded.</b> {f.excludedReason}</div></div>}
      <CodeBlock label="Logic written by the Feature engineer" code={f.logic} />
      <div className="row small faint">Source tables: {f.tables.map((t) => <span key={t} className="chip mono">{t}</span>)}</div>
    </Drawer>
  );
}

/* ---------------- VFP ---------------- */
function VfpTab({ jobs, feats }: { jobs?: import('@/api').VfpJob[]; feats: Feature[] }) {
  if (!jobs) return <LoadingBlock />;
  const counts = (['spec', 'building', 'ready', 'excluded'] as const).map((s) => [s, feats.filter((f) => (s === 'building' ? ['queued', 'building', 'validating'].includes(f.buildStatus) : f.buildStatus === s)).length] as const);
  if (!jobs.length) return <div className="card"><Empty title="Nothing submitted to VFP yet">The VFP builder submits a job once features are specified.</Empty></div>;
  const latest = jobs[0];
  return (
    <>
      <div className="grid g4">
        {counts.map(([s, n]) => <div key={s} className="card kpi"><span className="l">{s === 'spec' ? 'Spec written' : s === 'building' ? 'Building' : s === 'ready' ? 'Ready in Feature Store' : 'Excluded'}</span><span className="v">{n}</span></div>)}
      </div>
      <div className="grid split" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>VFP jobs</h3></div>
          <div className="tbl-wrap">
            <table className="t">
              <thead><tr><th>Job</th><th>Status</th><th>Partitions</th><th className="r">Rows</th><th>Submitted</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="mono">{j.id}<div className="faint xs">{j.featureIds.length} features</div></td>
                    <td><span className={`pill ${j.status === 'succeeded' ? 'good' : j.status === 'running' ? 'accent live' : j.status === 'failed' ? 'bad' : 'neutral'}`}>{j.status}</span></td>
                    <td style={{ minWidth: 160 }}><div className="row nowrap"><Bar value={j.partitionsDone / j.partitionsTotal} color="var(--features)" /><span className="num xs faint">{j.partitionsDone}/{j.partitionsTotal}</span></div></td>
                    <td className="r num">{fmtBig(j.rowsProcessed)}</td>
                    <td className="faint">{timeAgo(j.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card card-pad stack">
          <div className="row"><AgentBadge agent="vfp_builder" size={24} /><h3 className="grow">Constraints applied</h3></div>
          <p className="small muted">The VFP builder enforced these on <span className="mono">{latest.id}</span>. Change them under Spec and constraints.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {latest.constraintsApplied.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      </div>
    </>
  );
}
