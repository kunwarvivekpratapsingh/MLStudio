import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDeployment, useExperiments, useFeatures, useHypotheses, useSubHypotheses } from '@/lib/queries';
import type { LoopId, LoopState, Project } from '@/api';
import { LOOPS, LOOP_STATUS } from '@/lib/format';
import { nextStep } from '@/lib/nextStep';
import { Icon, LoadingBlock } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

export function OverviewPage() {
  const { project: p } = useProjectCtx();
  const hyps = useHypotheses(p.id);
  const subs = useSubHypotheses(p.id);
  const feats = useFeatures(p.id);
  const exps = useExperiments(p.id);
  const dep = useDeployment(p.id);

  const accepted = hyps.data?.filter((h) => h.status === 'accepted').length ?? 0;
  const ready = feats.data?.filter((f) => f.buildStatus === 'ready').length ?? 0;
  const done = exps.data?.filter((e) => e.metrics) ?? [];
  const best = done.filter((e) => e.outcome === 'kept').slice(-1)[0];

  return (
    <div className="page">
      <NextCard p={p} />

      <div className="grid g3">
        <OutputCard state={p.loops.features} loop="features" to="features" title="Feature engineering">
          {hyps.isLoading ? <LoadingBlock rows={2} /> : (
            <div className="stat-lines">
              <Stat label="Hypotheses" value={`${accepted} / ${hyps.data?.length ?? 0}`} />
              <Stat label="Sub-hypotheses" value={subs.data?.filter((s) => s.status === 'accepted').length ?? 0} />
              <Stat label="Features ready" value={`${ready} / ${feats.data?.length ?? 0}`} />
            </div>
          )}
        </OutputCard>
        <OutputCard state={p.loops.models} loop="models" to="models" title="Model lab">
          {done.length ? (
            <div className="stat-lines">
              <Stat label="Runs" value={exps.data?.length ?? 0} />
              <Stat label="Best so far" value={`${best?.metrics?.primary}%`} accent="var(--models)" />
              <Stat label="Baseline" value={`${done[0].metrics!.primary}%`} />
            </div>
          ) : null}
        </OutputCard>
        <OutputCard state={p.loops.deploy} loop="deploy" to="deploy" title="Deployment">
          {dep.data ? (
            <div className="stat-lines">
              <Stat label="Status" value={dep.data.status === 'live' ? <span className="pill good">Live</span> : dep.data.status.replace('_', ' ')} />
              <Stat label="Environment" value={dep.data.environment.toUpperCase()} />
              <div className="mono faint ellipsis" style={{ fontSize: 11.5 }} title={dep.data.modelVersion}>{dep.data.modelVersion}</div>
            </div>
          ) : null}
        </OutputCard>
      </div>

      <details className="problem-peek">
        <summary><span className="eyebrow">Problem statement</span><span className="small muted ellipsis grow">{p.statement}</span><span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Show</span></summary>
        <p style={{ lineHeight: 1.6 }}>{p.statement}</p>
        <Link to="settings" className="btn sm" style={{ alignSelf: 'flex-start' }}>Spec and constraints</Link>
      </details>
    </div>
  );
}

function OutputCard({ loop, state, to, title, children }: { loop: LoopId; state: LoopState; to: string; title: string; children: ReactNode }) {
  const st = state.status;
  return (
    <Link to={to} className={`card card-pad stack out-card ${st}`} style={{ ['--c' as string]: st === 'waiting' ? 'var(--gold)' : LOOPS[loop].color }}>
      <div className="row nowrap" style={{ gap: 10 }}>
        <span className={`ls-mark ${st}`}>{st === 'done' ? '✓' : st === 'waiting' ? '!' : LOOPS[loop].n}</span>
        <div className="grow">
          <h3>{title}</h3>
          <div className="ls-st">{LOOP_STATUS[st].label}</div>
        </div>
        <Icon name="arrow" size={14} />
      </div>
      <div className="ls-sum">{state.summary}</div>
      {st !== 'not_started' && st !== 'done' && <div className="bar"><i style={{ width: `${Math.max(4, state.progress * 100)}%`, background: 'var(--c)' }} /></div>}
      {children}
    </Link>
  );
}

function NextCard({ p }: { p: Project }) {
  const n = nextStep(p);
  const icon = n.tone === 'you' ? 'bell' : n.tone === 'live' ? 'rocket' : n.tone === 'draft' ? 'play' : n.tone === 'paused' ? 'pause' : 'spark';
  return (
    <div className={`next-card tone-${n.tone}`}>
      <span className="nc-ic"><Icon name={icon} /></span>
      <div className="grow">
        <div className="eyebrow">{n.tone === 'you' ? 'Your next step' : n.tone === 'agents' ? 'Nothing needed from you' : 'Status'}</div>
        <div className="nc-t">{n.title}</div>
        <div className="small muted">{n.detail}</div>
      </div>
      {n.cta && <Link to={n.to} className={`btn ${n.tone === 'you' ? 'gate' : 'primary'}`}>{n.cta} <Icon name="arrow" size={14} /></Link>}
      {!n.cta && <Link to={n.to} className="btn">Watch progress</Link>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="stat-line">
      <span className="faint">{label}</span>
      <b className="num" style={accent ? { color: accent } : undefined}>{value}</b>
    </div>
  );
}
