import type { LoopId, LoopState } from '@/api';
import { LOOPS, LOOP_STATUS } from '@/lib/format';

const SHORT: Record<LoopId, string> = { features: 'Features', models: 'Models', deploy: 'Deploy' };
const IDS: LoopId[] = ['features', 'models', 'deploy'];

function Mark({ k, s }: { k: LoopId; s: LoopState }) {
  const c = s.status === 'waiting' ? 'var(--gold)' : LOOPS[k].color;
  return (
    <span className={`ls-mark ${s.status}`} style={{ ['--c' as string]: c }}>
      {s.status === 'done' ? '✓' : s.status === 'waiting' ? '!' : LOOPS[k].n}
    </span>
  );
}

/** Compact three-step progress used on project cards. */
export function LoopStepsMini({ loops }: { loops: Record<LoopId, LoopState> }) {
  return (
    <div className="ls-mini" aria-label="Loop progress">
      {IDS.map((k, i) => (
        <div key={k} className={`ls-item ${loops[k].status}`} title={`${LOOPS[k].label}: ${LOOP_STATUS[loops[k].status].label}`}>
          <Mark k={k} s={loops[k]} />
          <span>{SHORT[k]}</span>
          {i < 2 && <i className={`ls-line ${loops[k].status === 'done' ? 'done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}
