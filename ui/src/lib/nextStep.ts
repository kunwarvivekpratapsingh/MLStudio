import type { LoopId, ProjectSummary } from '@/api';
import { LOOPS } from './format';

export type NextTone = 'you' | 'agents' | 'live' | 'draft' | 'paused' | 'failed';
export interface NextStep { tone: NextTone; title: string; detail: string; cta?: string; to: string }

/** One plain sentence on where a project stands and who acts next. */
export function nextStep(p: ProjectSummary): NextStep {
  const base = `/projects/${p.id}`;
  const waiting = (Object.keys(p.loops) as LoopId[]).find((k) => p.loops[k].status === 'waiting');
  if (waiting === 'features') return { tone: 'you', title: 'Review the proposed hypotheses', detail: 'Accept the ones worth testing. Feature engineering continues once you finish.', cta: 'Review hypotheses', to: `${base}/features` };
  if (waiting === 'deploy') return { tone: 'you', title: 'Approve the deployment', detail: 'The Researcher picked a model. Check its rationale and readiness, then approve it for the lower environment.', cta: 'Review and approve', to: `${base}/deploy` };
  if (waiting === 'models') return { tone: 'you', title: 'The model lab needs a decision', detail: p.loops.models.summary, cta: 'Open model lab', to: `${base}/models` };
  switch (p.status) {
    case 'draft': return { tone: 'draft', title: 'Check the spec, then start', detail: 'Nothing runs until you start the project.', cta: 'Review spec', to: `${base}/settings` };
    case 'deployed': return { tone: 'live', title: 'Model is live', detail: 'Send test payloads to the inference API from the deployment page.', cta: 'Test the API', to: `${base}/deploy` };
    case 'paused': return { tone: 'paused', title: 'Paused', detail: 'Resume from the project page when you are ready.', cta: 'Open project', to: base };
    case 'failed': return { tone: 'failed', title: 'Something failed', detail: 'Open the activity log to see what went wrong.', cta: 'Open activity', to: `${base}/activity` };
  }
  const cur = p.currentLoop;
  return { tone: 'agents', title: cur ? `Agents are working on ${LOOPS[cur].label.toLowerCase()}` : 'Agents are working', detail: cur ? p.loops[cur].summary : 'No action needed from you.', to: cur ? `${base}/${cur}` : base };
}
