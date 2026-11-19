import { useState } from 'react';
import type { AgentId, LoopId } from '@/api';
import { useEvents } from '@/lib/queries';
import { AGENT_META, LOOPS } from '@/lib/format';
import { EventList } from '@/components/EventList';
import { LoadingBlock } from '@/components/ui';
import { useProjectCtx } from './ProjectLayout';

export function ActivityPage() {
  const { project: p } = useProjectCtx();
  const events = useEvents(p.id, 500);
  const [loop, setLoop] = useState<LoopId | 'all'>('all');
  const [agent, setAgent] = useState<AgentId | 'all'>('all');
  const list = events.data?.filter((e) => (loop === 'all' || e.loop === loop) && (agent === 'all' || e.agent === agent)) ?? [];
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h2 style={{ fontSize: 20 }}>Activity</h2>
          <p>Everything the agents did on this project, newest first. Each entry names the agent, the skill or tool it used, and the artifact it changed.</p>
        </div>
      </div>
      <div className="row">
        <div className="subtabs">
          <button aria-selected={loop === 'all'} onClick={() => setLoop('all')}>All loops</button>
          {(Object.keys(LOOPS) as LoopId[]).map((k) => <button key={k} aria-selected={loop === k} onClick={() => setLoop(k)}>{LOOPS[k].n} · {LOOPS[k].label}</button>)}
        </div>
        <select className="select" style={{ width: 220 }} value={agent} onChange={(e) => setAgent(e.target.value as AgentId | 'all')} aria-label="Filter by agent">
          <option value="all">All agents</option>
          {(Object.keys(AGENT_META) as AgentId[]).map((a) => <option key={a} value={a}>{AGENT_META[a].name}</option>)}
        </select>
        <span className="faint small">{list.length} events</span>
      </div>
      <div className="card" style={{ padding: '0 16px' }}>{events.isLoading ? <LoadingBlock rows={8} /> : <EventList events={list} />}</div>
    </div>
  );
}
