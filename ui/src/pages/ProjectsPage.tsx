import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RunRow, byAttention } from './HomePage';
import type { ProjectSummary } from '@/api';
import { useProjects } from '@/lib/queries';
import { PROBLEM_TYPES, timeAgo } from '@/lib/format';
import { Empty, ErrorBlock, Icon, LoadingBlock, ProjectStatusPill } from '@/components/ui';

type Filter = 'all' | 'running' | 'needs_review' | 'deployed' | 'draft';
const FILTERS: [Filter, string][] = [['all', 'All'], ['running', 'Running'], ['needs_review', 'Needs review'], ['deployed', 'Deployed'], ['draft', 'Drafts']];

export function ProjectsPage() {
  const { data, isLoading, error } = useProjects();
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, running: 0, needs_review: 0, deployed: 0, draft: 0 };
    data?.forEach((p) => { c.all++; if (p.status === 'running' || p.status === 'paused') c.running++; else if (p.status in c) c[p.status as Filter]++; });
    return c;
  }, [data]);
  const list = data?.filter((p) => filter === 'all' || p.status === filter || (filter === 'running' && p.status === 'paused')).sort(byAttention) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Your projects</h1>
          <p>Open a project to see where it stands, or to review what the agents need from you. Projects keep running while you are away.</p>
        </div>
        <Link to="/projects/new" className="btn primary"><Icon name="plus" size={15} /> New project</Link>
      </div>

      <div className="subtabs" role="tablist" aria-label="Filter projects">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
            {l} <span className="num" style={{ opacity: 0.7 }}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="card run-list">
        {isLoading && <LoadingBlock rows={6} />}
        {error && <div className="card-pad"><ErrorBlock error={error} /></div>}
        {data && list.length === 0 && (
          <Empty title="No projects here" action={<Link className="btn primary" to="/projects/new">Start a project</Link>}>
            Start a project with a problem statement. The agents take it from there.
          </Empty>
        )}
        {list.map((p) => (p.status === 'draft' ? <DraftRow key={p.id} p={p} /> : <RunRow key={p.id} p={p} />))}
      </div>
    </div>
  );
}

function DraftRow({ p }: { p: ProjectSummary }) {
  return (
    <Link to={`/projects/${p.id}`} className="run-row">
      <span className="draft-ic"><Icon name="file" size={18} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}><b className="run-name">{p.name}</b><ProjectStatusPill status={p.status} /></div>
        <div className="xs faint">{PROBLEM_TYPES[p.problemType].label} · saved {timeAgo(p.updatedAt)}</div>
      </div>
      <div className="run-stage small faint">Not started</div>
      <div className="run-next small">Check the spec, then start</div>
      <div className="run-metric" />
      <Icon name="arrow" size={15} />
    </Link>
  );
}
