import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { nextStep } from '@/lib/nextStep';
import { rememberProject, runProgress } from '@/lib/progress';
import { ProgressRing, RunTiming } from '@/components/RunProgress';
import { useEffect } from 'react';
import type { LoopId, Project } from '@/api';
import { useProject, useSetLoopPaused } from '@/lib/queries';
import { LOOPS, PROBLEM_TYPES, dateShort } from '@/lib/format';
import { Empty, ErrorBlock, Icon, LoadingBlock, ProjectStatusPill, useToast } from '@/components/ui';

const tabCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
const tabCls2 = ({ isActive }: { isActive: boolean }) => `sec ${isActive ? 'active' : ''}`;

export interface ProjectCtx { project: Project }
export const useProjectCtx = () => useOutletContext<ProjectCtx>();

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const { data: project, isLoading, error } = useProject(projectId);
  const pause = useSetLoopPaused(projectId);
  const toast = useToast();
  const loc = useLocation();
  useEffect(() => { if (project) rememberProject(project.id); }, [project?.id]);

  if (isLoading) return <div className="page"><LoadingBlock rows={6} /></div>;
  if (error || !project) return <div className="page">{error ? <ErrorBlock error={error} /> : <Empty title="Project not found" />}</div>;

  const cur = project.currentLoop;
  const next = nextStep(project);
  const prog = runProgress(project);
  const curState = cur ? project.loops[cur] : null;

  return (
    <>
      <div className="project-head">
        <div className="inner">
          <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
            <div className="grow stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 10 }}>
                <h1>{project.name}</h1>
                <ProjectStatusPill status={project.status} />
              </div>
              <span className="faint xs">{PROBLEM_TYPES[project.problemType].label} · created {dateShort(project.createdAt)} by {project.owner}</span>
              {project.status !== 'draft' && (
                <div className="run-strip">
                  <ProgressRing pct={prog.pct} size={34} stroke={4} color={next.tone === 'you' ? 'var(--gold)' : next.tone === 'live' ? 'var(--good)' : cur ? LOOPS[cur].color : 'var(--accent)'} />
                  <span><b>{prog.pct}% overall</b> · Step {prog.stepN} of 3: {prog.stepLabel} · <RunTiming p={project} /></span>
                  {prog.active && <span className="rs-bg" title="Agents run on the platform. Closing the browser does not stop them.">Runs in the background</span>}
                </div>
              )}
            </div>
            <div className="row">
              {project.status === 'draft' && (
                <button className="btn primary" onClick={() => pause.mutate({ loop: 'features', paused: false }, { onSuccess: () => toast('Project started') })}>
                  <Icon name="play" size={14} /> Start project
                </button>
              )}
              {cur && curState?.status === 'running' && (
                <button className="btn" onClick={() => pause.mutate({ loop: cur, paused: true }, { onSuccess: () => toast(`${LOOPS[cur].label} paused`) })}>
                  <Icon name="pause" size={14} /> Pause {LOOPS[cur].label.toLowerCase()}
                </button>
              )}
              {cur && curState?.status === 'paused' && (
                <button className="btn primary" onClick={() => pause.mutate({ loop: cur, paused: false }, { onSuccess: () => toast(`${LOOPS[cur].label} resumed`) })}>
                  <Icon name="play" size={14} /> Resume
                </button>
              )}
            </div>
          </div>

          <nav className="tabs ptabs" aria-label="Project sections">
            <NavLink end to="." className={tabCls}>Overview</NavLink>
            {(Object.keys(LOOPS) as LoopId[]).map((k) => {
              const st = project.loops[k].status;
              return (
                <NavLink key={k} to={k} className={tabCls} style={{ ['--c' as string]: LOOPS[k].color }}>
                  <span className={`tab-mark ${st}`}>{st === 'done' ? '✓' : st === 'waiting' ? '!' : LOOPS[k].n}</span>
                  {LOOPS[k].label}
                </NavLink>
              );
            })}
            <span className="spacer" />
            <NavLink to="artifacts" className={tabCls2}><Icon name="file" size={14} /> Files</NavLink>
            <NavLink to="activity" className={tabCls2}><Icon name="activity" size={14} /> Activity</NavLink>
            <NavLink to="settings" className={tabCls2}><Icon name="settings" size={14} /> Spec and constraints</NavLink>
          </nav>
        </div>
      </div>
      {next.tone === 'you' && !loc.pathname.replace(/\/$/, '').endsWith(project.id) && !loc.pathname.endsWith(next.to.split('/').pop()!) && (
        <Link to={next.to} className="next-bar">
          <span className="sec-dot gold" />
          <b>{next.title}.</b>
          <span className="muted grow ellipsis">{next.detail}</span>
          <span className="btn gate sm">{next.cta} <Icon name="arrow" size={13} /></span>
        </Link>
      )}
      <Outlet context={{ project } satisfies ProjectCtx} />
    </>
  );
}
