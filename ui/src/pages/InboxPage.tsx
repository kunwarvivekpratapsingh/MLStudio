import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDecisions } from '@/lib/queries';
import { LOOPS, timeAgo } from '@/lib/format';
import { Empty, Icon, LoadingBlock } from '@/components/ui';
import { AwayCard } from './HomePage';

export function InboxPage() {
  const { data, isLoading } = useDecisions();
  const [tab, setTab] = useState<'you' | 'updates'>('you');
  return (
    <div className="page narrow">
      <div className="page-head">
        <div className="grow">
          <h1>Review</h1>
          <p>Agents pause at a few checkpoints and wait for you. Everything else they report here as updates.</p>
        </div>
      </div>
      <div className="subtabs view-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'you'} onClick={() => setTab('you')}>Needs you {!!data?.length && <span className="tab-count">{data.length}</span>}</button>
        <button role="tab" aria-selected={tab === 'updates'} onClick={() => setTab('updates')}>While you were away</button>
      </div>
      {tab === 'you' && (
        <div className="stack" style={{ gap: 10 }}>
          {isLoading && <LoadingBlock />}
          {data && !data.length && <div className="card"><Empty title="You’re all caught up">No project is waiting on you. Agents keep working and will stop here when they need a decision.</Empty></div>}
          {data?.map((d) => (
            <Link key={d.id} to={d.link} className="todo">
              <span className="pill gate">Step {LOOPS[d.loop].n} · {LOOPS[d.loop].label}</span>
              <div className="grow" style={{ flexBasis: 260 }}>
                <div className="todo-t">{d.title}</div>
                <div className="small muted">{d.projectName} · waiting {timeAgo(d.createdAt).replace(' ago', '')}</div>
              </div>
              <span className="btn gate sm">Review <Icon name="arrow" size={13} /></span>
            </Link>
          ))}
        </div>
      )}
      {tab === 'updates' && <AwayCard />}
    </div>
  );
}
