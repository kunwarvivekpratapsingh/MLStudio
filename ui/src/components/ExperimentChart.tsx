import type { Experiment } from '@/api';

/** Every run as a dot, with the best-so-far line. Kept runs are filled. */
export function ExperimentChart({ experiments, max, compact, selectedId, onSelect }: { experiments: Experiment[]; max: number; compact?: boolean; selectedId?: string; onSelect?: (id: string) => void }) {
  const done = experiments.filter((e) => e.metrics);
  if (!done.length) return <div className="empty small">No completed runs yet.</div>;
  const W = 720, H = compact ? 200 : 300, L = 46, R = 16, T = 18, B = 30;
  const vals = done.map((e) => e.metrics!.primary);
  const lo = Math.floor((Math.min(...vals) - 2) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) + 2) / 5) * 5;
  const n = Math.max(max, experiments.length + 2);
  const x = (i: number) => L + ((i - 1) / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let best = -Infinity;
  const pts: [number, number][] = [];
  done.forEach((e) => {
    if (e.outcome === 'kept') best = Math.max(best, e.metrics!.primary);
    pts.push([x(e.index), y(best)]);
  });
  const path = pts.map(([px, py], i) => (i ? `H${px.toFixed(1)}V${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`)).join('');
  const area = `${path}H${pts[pts.length - 1][0].toFixed(1)}V${H - B}H${x(1)}Z`;
  const champ = done.filter((e) => e.outcome === 'kept').reduce((a, b) => (b.metrics!.primary >= a.metrics!.primary ? b : a));
  const training = experiments.find((e) => e.status === 'training');
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const xticks = [1, ...Array.from({ length: Math.floor(n / 10) }, (_, i) => (i + 1) * 10)].filter((v) => v <= n);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Best result rises from ${done[0].metrics!.primary}% to ${champ.metrics!.primary}% over ${done.length} runs`}>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text>
        </g>
      ))}
      {xticks.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{i}</text>)}
      <path d={area} fill="var(--models)" opacity={0.08} />
      <path d={path} fill="none" stroke="var(--models)" strokeWidth={2.2} />
      {done.map((e) => (
        <circle
          key={e.id}
          cx={x(e.index)}
          cy={y(e.metrics!.primary)}
          r={e.id === selectedId ? 6 : e.outcome === 'kept' ? 4.2 : 3.2}
          fill={e.outcome === 'kept' ? 'var(--models)' : 'var(--surface)'}
          stroke={e.id === selectedId ? 'var(--accent)' : e.outcome === 'kept' ? 'var(--models)' : 'var(--fg-3)'}
          strokeWidth={e.id === selectedId ? 2.5 : 1.3}
          style={{ cursor: onSelect ? 'pointer' : undefined }}
          onClick={() => onSelect?.(e.id)}
        >
          <title>{`Run ${e.index}: ${e.change} · ${e.metrics!.primary}%`}</title>
        </circle>
      ))}
      <circle cx={x(champ.index)} cy={y(champ.metrics!.primary)} r={9} fill="none" stroke="var(--models)" strokeWidth={2} />
      <text x={Math.min(x(champ.index) + 12, W - 140)} y={y(champ.metrics!.primary) - 12} style={{ fill: 'var(--models)', fontWeight: 700 }}>
        Best {champ.metrics!.primary}% · run {champ.index}
      </text>
      {training && (
        <circle cx={x(training.index)} cy={y(champ.metrics!.primary) + 10} r={4.5} fill="var(--deploy)">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
          <title>{`Run ${training.index} training: ${training.change}`}</title>
        </circle>
      )}
    </svg>
  );
}
