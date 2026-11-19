import type { AgentId, LoopId, LoopStatus, ProblemType, ProjectStatus } from '@/api';

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtBig = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : fmtInt(n));

export const PROBLEM_TYPES: Record<ProblemType, { label: string; blurb: string }> = {
  fraud: { label: 'Fraud detection', blurb: 'Score transactions or events for fraud' },
  false_decline: { label: 'False declines', blurb: 'Recover genuine transactions that were declined' },
  friendly_fraud: { label: 'Friendly fraud', blurb: 'Spot first-party misuse in disputes' },
  merchant_risk: { label: 'Merchant risk', blurb: 'Find risky or compromised merchants' },
  other: { label: 'Other', blurb: 'Any other VisaNet problem' },
};

export const LOOPS: Record<LoopId, { n: number; label: string; long: string; color: string; soft: string; cls: string }> = {
  features: { n: 1, label: 'Feature engineering', long: 'Outer loop · hypotheses to features on VFP', color: 'var(--features)', soft: 'var(--features-soft)', cls: 'features' },
  models: { n: 2, label: 'Model lab', long: 'Middle loop · auto-research training and improvement', color: 'var(--models)', soft: 'var(--models-soft)', cls: 'models' },
  deploy: { n: 3, label: 'Deployment', long: 'Inner loop · lower environment and inference API', color: 'var(--deploy)', soft: 'var(--deploy-soft)', cls: 'deploy' },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string; live?: boolean }> = {
  draft: { label: 'Draft', cls: 'neutral' },
  running: { label: 'Running', cls: 'accent', live: true },
  needs_review: { label: 'Needs your review', cls: 'gate' },
  paused: { label: 'Paused', cls: 'warn' },
  deployed: { label: 'Deployed', cls: 'good' },
  failed: { label: 'Failed', cls: 'bad' },
};

export const LOOP_STATUS: Record<LoopStatus, { label: string; cls: string; live?: boolean }> = {
  not_started: { label: 'Not started', cls: 'neutral' },
  running: { label: 'Running', cls: 'accent', live: true },
  waiting: { label: 'Waiting on you', cls: 'gate' },
  paused: { label: 'Paused', cls: 'warn' },
  done: { label: 'Done', cls: 'good' },
  failed: { label: 'Failed', cls: 'bad' },
};

export const AGENT_META: Record<AgentId, { name: string; ab: string; loop: LoopId | 'project' }> = {
  orchestrator: { name: 'Orchestrator', ab: 'OR', loop: 'project' },
  hypothesis: { name: 'Hypothesis agent', ab: 'HY', loop: 'features' },
  sub_hypothesis: { name: 'Sub-hypothesis agent', ab: 'SH', loop: 'features' },
  feature_engineer: { name: 'Feature engineer', ab: 'FE', loop: 'features' },
  vfp_builder: { name: 'VFP builder', ab: 'VF', loop: 'features' },
  validator: { name: 'Validator', ab: 'VA', loop: 'features' },
  researcher: { name: 'Researcher', ab: 'RS', loop: 'models' },
  trainer: { name: 'Trainer', ab: 'TR', loop: 'models' },
  deployer: { name: 'Deployer', ab: 'DE', loop: 'deploy' },
};

export function loopColor(loop: LoopId | 'project' | 'mission'): { c: string; s: string } {
  if (loop === 'project' || loop === 'mission') return { c: 'var(--accent)', s: 'var(--accent-soft)' };
  return { c: LOOPS[loop].color, s: LOOPS[loop].soft };
}
