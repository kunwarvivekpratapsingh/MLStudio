import { Link } from 'react-router-dom';
import type { AgentEvent, ProjectSummary } from '@/api';
import { useEvents, useProjects } from '@/lib/queries';
import { LOOPS, timeAgo } from '@/lib/format';
import { nextStep } from '@/lib/nextStep';
import { lastProjectId, previousVisit, runProgress } from '@/lib/progress';
import { AgentBadge, ErrorBlock, Icon, LoadingBlock, ProjectStatusPill } from '@/components/ui';
import { ProgressRing, RunTiming } from '@/components/RunProgress';
import { useGuide } from '@/components/Guide';

const RANK: Record<string, number> = { you: 0, agents: 1, paused: 2, failed: 2, live: 3, draft: 4 };
export const byAttention = (a: ProjectSummary, b: ProjectSummary) =>
  (RANK[nextStep(a).tone] ?? 5) - (RANK[nextStep(b).tone] ?? 5) || +new Date(b.updatedAt) - +new Date(a.updatedAt);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { data, isLoading, error } = useProjects();
  const guide = useGuide();
  const all = data ?? [];
  const active = all.filter((p) => p.status !== 'draft').sort(byAttention);
  const running = active.filter((p) => p.status !== 'deployed');
  const needYou = active.filter((p) => nextStep(p).tone === 'you');
  const lastId = lastProjectId();
  const resume = all.find((p) => p.id === lastId && p.status !== 'draft') ?? running[0];

  return (
    <div className="page home-min">
      <section className="w-center">
        <span className="w-eyebrow">ML Studio</span>
        <h1>{greeting()}, Priya</h1>
        <p>{isLoading ? 'Loading…'
          : needYou.length ? `${needYou.length} ${needYou.length === 1 ? 'project needs' : 'projects need'} your review.`
          : running.length ? `Agents are working on ${running.length} ${running.length === 1 ? 'project' : 'projects'}. Nothing needs you right now.`
          : 'Turn a business problem into a deployed model.'}</p>
      </section>

      {error && <ErrorBlock error={error} />}

      <div className="w-choices-2">
        <Link to="/projects" className="w-tile">
          <span className="w-ic"><Icon name="folder" /></span>
          <b>Existing projects</b>
          <span>{all.length ? `${running.length} running${needYou.length ? ` · ${needYou.length} to review` : ''}` : 'Nothing here yet'}</span>
          <span className="w-go">Open <Icon name="arrow" size={14} /></span>
        </Link>
        <Link to="/projects/new" className="w-tile primary">
          <span className="w-ic"><Icon name="plus" /></span>
          <b>New project</b>
          <span>Describe the problem. Agents do the rest.</span>
          <span className="w-go">Start <Icon name="arrow" size={14} /></span>
        </Link>
      </div>

      {resume && <ContinueLine p={resume} returning={resume.id === lastId} />}

      <button className="w-link-plain" onClick={guide.show}><Icon name="help" size={14} /> New here? See how ML Studio works</button>
    </div>
  );
}

function ContinueLine({ p, returning }: { p: ProjectSummary; returning: boolean }) {
  const r = runProgress(p);
  const n = nextStep(p);
  const color = n.tone === 'you' ? 'var(--gold)' : n.tone === 'live' ? 'var(--good)' : p.currentLoop ? LOOPS[p.currentLoop].color : 'var(--accent)';
  return (
    <Link to={n.tone === 'you' ? n.to : `/projects/${p.id}`} className={`continue tone-${n.tone}`}>
      <ProgressRing pct={r.pct} size={52} stroke={5} color={color} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="xs faint">{returning ? 'Continue where you left off' : 'Most active project'}</div>
        <div className="continue-name ellipsis">{p.name}</div>
        <div className="small muted ellipsis">Step {r.stepN} of 3 · {r.stepLabel} · {n.title}</div>
      </div>
      <span className={`btn ${n.tone === 'you' ? 'gate' : 'primary'}`}>{n.tone === 'you' ? n.cta : 'Continue'} <Icon name="arrow" size={14} /></span>
    </Link>
  );
}

const IMPORTANT = new Set(['milestone', 'decision', 'warning', 'error']);

export function AwayCard() {
  const events = useEvents(undefined, 200);
  const recent = previousVisit && Date.now() - +new Date(previousVisit) > 30 * 60000;
  const since = recent ? +new Date(previousVisit!) : Date.now() - 24 * 3600000;
  const list = (events.data ?? []).filter((e) => +new Date(e.ts) > since);
  const key = list.filter((e) => IMPORTANT.has(e.kind)).slice(0, 5);
  const shown: AgentEvent[] = key.length ? key : list.slice(0, 5);
  const projects = new Set(list.map((e) => e.projectId)).size;
  return (
    <section className="card away">
      <div className="card-head">
        <div>
          <h3>{recent ? 'While you were away' : 'In the last 24 hours'}</h3>
          <div className="xs faint">{recent ? `Since ${timeAgo(previousVisit!)}` : 'Agents keep working when you are offline'}</div>
        </div>
        {list.length > 0 && <span className="pill accent">{list.length} updates · {projects} {projects === 1 ? 'project' : 'projects'}</span>}
      </div>
      {events.isLoading ? <LoadingBlock rows={3} /> : shown.length === 0 ? (
        <div className="card-pad faint small">No new agent activity since your last visit.</div>
      ) : (
        <ul className="away-list">
          {shown.map((e) => (
            <li key={e.id}>
              <Link to={`/projects/${e.projectId}${e.loop !== 'project' ? `/${e.loop}` : ''}`}>
                <AgentBadge agent={e.agent} size={26} />
                <span className="grow">
                  <span className="away-msg">{e.message}</span>
                  <span className="xs faint">{e.projectName} · {timeAgo(e.ts)}</span>
                </span>
                {e.kind === 'decision' && <span className="pill gate">Needs you</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RunRow({ p }: { p: ProjectSummary }) {
  const r = runProgress(p);
  const n = nextStep(p);
  const color = n.tone === 'you' ? 'var(--gold)' : n.tone === 'live' ? 'var(--good)' : p.currentLoop ? LOOPS[p.currentLoop].color : 'var(--accent)';
  return (
    <Link to={n.tone === 'you' ? n.to : `/projects/${p.id}`} className="run-row">
      <ProgressRing pct={r.pct} size={46} stroke={5} color={color} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="run-name">{p.name}</b>
          <ProjectStatusPill status={p.status} />
        </div>
        <div className="xs faint ellipsis"><RunTiming p={p} /></div>
      </div>
      <div className="run-stage">
        <div className="small"><span className="faint">Step {r.stepN} of 3 · </span><b>{r.stepLabel}</b></div>
        <div className="bar"><i style={{ width: `${r.loopPct}%`, background: color }} /></div>
      </div>
      <div className={`run-next tone-${n.tone}`}>
        <div className="small">{n.title}</div>
      </div>
      {p.headline ? (
        <div className="run-metric"><b className="num">{p.headline.value}{p.headline.unit}</b><span className="xs faint">{p.headline.metricName.split(' ')[0]}</span></div>
      ) : <div className="run-metric" />}
      <Icon name="arrow" size={15} />
    </Link>
  );
}
