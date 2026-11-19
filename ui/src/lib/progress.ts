import type { LoopId, ProjectSummary } from '@/api';
import { LOOPS } from './format';

/* Long-running work: overall percent, stage, elapsed time and an ETA for each project. */
const WEIGHT: Record<LoopId, number> = { features: 0.35, models: 0.5, deploy: 0.15 };
const IDS: LoopId[] = ['features', 'models', 'deploy'];

export interface RunProgress {
  pct: number;              // 0..100 across all three loops
  stepN: number;            // 1..3
  stepLabel: string;
  loopPct: number;          // 0..100 within the current loop
  elapsedMs?: number;       // since the project started running
  remainingMs?: number;     // for the current loop
  active: boolean;          // agents are working right now
}

export function runProgress(p: ProjectSummary, now = Date.now()): RunProgress {
  let pct = 0;
  for (const k of IDS) pct += WEIGHT[k] * (p.loops[k].status === 'done' ? 1 : p.loops[k].progress);
  const cur: LoopId = p.currentLoop ?? (p.status === 'deployed' ? 'deploy' : 'features');
  const L = p.loops[cur];
  const started = p.loops.features.startedAt;
  let remainingMs: number | undefined;
  if (L.etaAt) remainingMs = Math.max(0, new Date(L.etaAt).getTime() - now);
  else if (L.status === 'running' && L.startedAt && L.progress > 0.03 && L.progress < 1) {
    const spent = now - new Date(L.startedAt).getTime();
    remainingMs = (spent / L.progress) * (1 - L.progress);
  }
  return {
    pct: p.status === 'deployed' ? 100 : Math.round(pct * 100),
    stepN: LOOPS[cur].n,
    stepLabel: LOOPS[cur].label,
    loopPct: Math.round((L.status === 'done' ? 1 : L.progress) * 100),
    elapsedMs: started ? (p.status === 'deployed' && p.loops.deploy.finishedAt ? new Date(p.loops.deploy.finishedAt).getTime() : now) - new Date(started).getTime() : undefined,
    remainingMs,
    active: L.status === 'running',
  };
}

export function duration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24 ? `${h % 24} h` : ''}`.trim();
}

/* Visit memory, so a returning scientist sees what changed and lands back on their last project. */
const SEEN = 'mlstudio.lastSeen';
const LAST = 'mlstudio.lastProject';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

/** When this browser last opened ML Studio. Pinned for the session so reloads don't reset "while you were away". */
export const previousVisit: string | null = (() => {
  try {
    const pinned = sessionStorage.getItem(SEEN);
    if (pinned !== null) return pinned || null;
    const v = read(SEEN);
    sessionStorage.setItem(SEEN, v ?? '');
    write(SEEN, new Date().toISOString());
    return v;
  } catch { return null; }
})();
export const lastProjectId = () => read(LAST);
export const rememberProject = (id: string) => write(LAST, id);
