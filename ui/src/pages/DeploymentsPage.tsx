import { Link } from 'react-router-dom';
import { useDeployments } from '@/lib/queries';
import { fmtInt, timeAgo } from '@/lib/format';
import { Empty, LoadingBlock } from '@/components/ui';

export function DeploymentsPage() {
  const { data, isLoading } = useDeployments();
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Deployments</h1>
          <p>Every model the agents have deployed to a lower environment, with its inference endpoint.</p>
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingBlock />}
        {data && !data.length && <Empty title="No deployments yet">Models appear here after the Deployer puts them in a lower environment.</Empty>}
        {!!data?.length && (
          <div className="tbl-wrap">
            <table className="t">
              <thead><tr><th>Model</th><th>Project</th><th>Env</th><th>Status</th><th>Endpoint</th><th className="r">Requests / h</th><th className="r">p99</th><th>Live since</th></tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td className="mono"><Link to={`/projects/${d.projectId}/deploy`}>{d.modelVersion}</Link></td>
                    <td>{d.projectName}</td>
                    <td><span className="chip">{d.environment.toUpperCase()}</span></td>
                    <td>{d.status === 'live' ? <span className="pill good">Live</span> : d.status === 'awaiting_approval' ? <span className="pill gate">Awaiting approval</span> : <span className="pill deploy live">{d.status}</span>}</td>
                    <td className="mono xs faint" style={{ maxWidth: 320, wordBreak: 'break-all' }}>{d.endpoint ?? '—'}</td>
                    <td className="r num">{d.traffic ? fmtInt(d.traffic.requestsLastHour) : '—'}</td>
                    <td className="r num">{d.traffic ? `${d.traffic.p99Ms} ms` : '—'}</td>
                    <td className="faint">{d.liveAt ? timeAgo(d.liveAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
