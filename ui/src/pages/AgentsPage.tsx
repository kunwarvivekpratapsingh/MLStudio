import { useAgents } from '@/lib/queries';
import { LOOPS, loopColor } from '@/lib/format';
import { AgentBadge, LoadingBlock } from '@/components/ui';

export function AgentsPage() {
  const { data } = useAgents();
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Agents and skills</h1>
          <p>The Claude Code agents behind every project. Each has one job, a fixed set of skills and tools, and the artifacts it is responsible for. The UI and <span className="mono">/mltc</span> in the terminal drive the same agents.</p>
        </div>
      </div>
      {!data && <LoadingBlock rows={6} />}
      <div className="grid g3">
        {data?.map((a) => {
          const { c } = loopColor(a.loop);
          return (
            <div key={a.id} className="card card-pad stack" style={{ gap: 10, borderTop: `3px solid ${c}` }}>
              <div className="row nowrap"><AgentBadge agent={a.id} size={34} /><div className="grow"><h3>{a.name}</h3><span className="xs" style={{ color: c, fontWeight: 600 }}>{a.loop === 'mission' ? 'Whole project' : `Loop ${LOOPS[a.loop].n} · ${LOOPS[a.loop].label}`}</span></div></div>
              <p className="small muted">{a.role}</p>
              <div><span className="eyebrow">Skills and tools</span><div className="row" style={{ gap: 4, marginTop: 4 }}>{a.skills.map((s) => <span key={s} className="chip mono">{s}</span>)}</div></div>
              <div><span className="eyebrow">Writes</span><div className="row" style={{ gap: 4, marginTop: 4 }}>{a.produces.map((s) => <span key={s} className="chip mono">{s.split('/')[1]}</span>)}</div></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
