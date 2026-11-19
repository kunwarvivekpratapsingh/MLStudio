import { Link } from 'react-router-dom';
import type { AgentEvent } from '@/api';
import { AGENT_META, timeAgo } from '@/lib/format';
import { AgentBadge, Icon } from './ui';

const KIND_PILL: Partial<Record<AgentEvent['kind'], [string, string]>> = {
  decision: ['gate', 'Needs you'],
  milestone: ['good', 'Milestone'],
  warning: ['warn', 'Warning'],
  error: ['bad', 'Error'],
};

function renderMsg(m: string) {
  return m.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i} style={{ color: 'var(--fg)' }}>{part.slice(2, -2)}</b> : part));
}

export function EventList({ events, showProject = false, freshIds }: { events: AgentEvent[]; showProject?: boolean; freshIds?: Set<string> }) {
  if (!events.length) return <div className="empty small">No agent activity yet.</div>;
  return (
    <div>
      {events.map((e) => {
        const kp = KIND_PILL[e.kind];
        return (
          <div key={e.id} className={`ev ${freshIds?.has(e.id) ? 'fresh' : ''}`}>
            <AgentBadge agent={e.agent} />
            <div style={{ minWidth: 0 }}>
              <div className="ev-top">
                <b>{AGENT_META[e.agent].name}</b>
                {showProject && (
                  <Link to={`/projects/${e.projectId}`} className="faint ellipsis" style={{ maxWidth: 220 }}>
                    {e.projectName}
                  </Link>
                )}
                {kp && <span className={`pill ${kp[0]}`}>{kp[1]}</span>}
                <span className="spacer" />
                <span className="faint xs num" title={new Date(e.ts).toLocaleString()}>{timeAgo(e.ts)}</span>
              </div>
              <div className="ev-msg">{renderMsg(e.message)}</div>
              {(e.tool || e.artifactPath) && (
                <div className="ev-meta">
                  {e.tool && <span className="chip mono">{e.tool}</span>}
                  {e.artifactPath && (
                    <Link className="chip mono" to={`/projects/${e.projectId}/artifacts?path=${encodeURIComponent(e.artifactPath)}`}>
                      <Icon name="file" size={11} /> {e.artifactPath}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
