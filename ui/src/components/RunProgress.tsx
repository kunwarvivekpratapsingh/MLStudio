import type { ProjectSummary } from '@/api';
import { duration, runProgress } from '@/lib/progress';
import { timeAgo } from '@/lib/format';

export function ProgressRing({ pct, size = 64, stroke = 6, color = 'var(--accent)', label }: { pct: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${pct}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.6s' }} />
      </svg>
      <span style={{ fontSize: size * 0.24 }}>{pct}%{label && <em>{label}</em>}</span>
    </div>
  );
}

/** One line on timing: how long it has run, how long is left, and when agents last reported. */
export function RunTiming({ p }: { p: ProjectSummary }) {
  const r = runProgress(p);
  const bits: string[] = [];
  if (p.status === 'draft') bits.push('Not started');
  else if (p.status === 'deployed') bits.push(`Took ${r.elapsedMs ? duration(r.elapsedMs) : '—'} end to end`);
  else {
    if (r.elapsedMs) bits.push(`Running for ${duration(r.elapsedMs)}`);
    if (r.active && r.remainingMs !== undefined) bits.push(`about ${duration(r.remainingMs)} left in this step`);
    if (p.status === 'needs_review') bits.push('paused until you review');
  }
  if (p.lastActivity) bits.push(`last update ${timeAgo(p.lastActivity.ts)}`);
  return <span>{bits.join(' · ')}</span>;
}
