import { Link } from 'react-router-dom';
import { useAgents, useCatalog, useDeployments } from '@/lib/queries';
import { Icon } from '@/components/ui';

export function PlatformPage() {
  const deps = useDeployments();
  const cat = useCatalog();
  const agents = useAgents();
  const live = deps.data?.filter((d) => d.status === 'live').length ?? 0;
  const tiles = [
    { to: '/deployments', icon: 'rocket', t: 'Deployments', d: 'Every model deployed to a lower environment, with its endpoint and traffic.', n: deps.data ? `${live} live` : '' },
    { to: '/catalog', icon: 'data', t: 'VisaNet data', d: 'Tables and columns the agents can use when engineering features.', n: cat.data ? `${cat.data.length} tables` : '' },
    { to: '/agents', icon: 'bot', t: 'Agents and skills', d: 'What each agent does, its Claude Code skills, and the files it writes.', n: agents.data ? `${agents.data.length} agents` : '' },
  ];
  return (
    <div className="page narrow">
      <div className="page-head">
        <div className="grow">
          <h1>Platform</h1>
          <p>Reference for everything that sits behind your projects. You don't need these to run a project.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className="plat-tile">
            <span className="new-ic"><Icon name={x.icon} /></span>
            <div className="grow"><b>{x.t}</b><div className="small muted">{x.d}</div></div>
            <span className="faint small">{x.n}</span>
            <Icon name="arrow" size={15} />
          </Link>
        ))}
      </div>
    </div>
  );
}
