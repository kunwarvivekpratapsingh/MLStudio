import type {
  AgentEvent,
  Deployment,
  Experiment,
  Feature,
  FieldSpec,
  Hypothesis,
  ModelSelection,
  Project,
  SubHypothesis,
  VfpJob,
} from '../types';
import { nextExperiment, rng } from './experiments';
import { expandHypotheses, SEEDS, type ProjectSeed } from './seed';

export interface ProjectState {
  project: Project;
  seed: ProjectSeed;
  hypotheses: Hypothesis[];
  subs: SubHypothesis[];
  features: Feature[];
  vfpJobs: VfpJob[];
  experiments: Experiment[];
  selection: ModelSelection | null;
  deployment: Deployment | null;
  events: AgentEvent[];
  artifactVersions: Record<string, { version: number; updatedAt: string }>;
  rand: () => number;
  /** Ticks to wait before the next simulated step. */
  cooldown: number;
}

const DAY = 86_400_000;
export const iso = (d: Date) => d.toISOString();

let eventSeq = 0;
export function makeEvent(s: ProjectState, e: Omit<AgentEvent, 'id' | 'projectId' | 'projectName' | 'ts'> & { ts?: string }): AgentEvent {
  const ev: AgentEvent = { id: `ev-${++eventSeq}`, projectId: s.project.id, projectName: s.project.name, ts: e.ts ?? iso(new Date()), ...e };
  s.events.unshift(ev);
  if (ev.artifactPath) {
    const cur = s.artifactVersions[ev.artifactPath];
    s.artifactVersions[ev.artifactPath] = { version: (cur?.version ?? 0) + 1, updatedAt: ev.ts };
  }
  s.project.lastActivity = { ts: ev.ts, agent: ev.agent, message: ev.message.replace(/\*\*/g, '') };
  s.project.updatedAt = ev.ts;
  return ev;
}

export function inputSchemaFor(seed: ProjectSeed): { schema: FieldSpec[]; sample: Record<string, unknown>; decision: [string, string] } {
  if (seed.problemType === 'friendly_fraud') {
    return {
      decision: ['route_to_representment', 'accept_dispute'],
      schema: [
        { name: 'dispute_id', type: 'string', required: true, description: 'Dispute identifier', example: 'DSP-88213-0042' },
        { name: 'txn_id', type: 'string', required: true, description: 'Disputed transaction', example: 'TX9F3A21C7' },
        { name: 'pan_token', type: 'string', required: true, description: 'Tokenized PAN, used to look up card features', example: 'tok_4f1c9a77e2' },
        { name: 'merchant_id', type: 'string', required: true, description: 'Card acceptor ID', example: 'M-00731942' },
        { name: 'reason_code', type: 'string', required: true, description: '10.4, 13.1 or 13.3', example: '13.1' },
        { name: 'amount_usd', type: 'number', required: true, description: 'Disputed amount', example: 129.99 },
        { name: 'mcc', type: 'string', required: true, description: 'Merchant category code', example: '5816' },
        { name: 'dispute_ts', type: 'timestamp', required: true, description: 'When the dispute was opened', example: '2026-11-17T14:02:00Z' },
      ],
      sample: { dispute_id: 'DSP-88213-0042', txn_id: 'TX9F3A21C7', pan_token: 'tok_4f1c9a77e2', merchant_id: 'M-00731942', reason_code: '13.1', amount_usd: 129.99, mcc: '5816', dispute_ts: '2026-11-17T14:02:00Z' },
    };
  }
  if (seed.problemType === 'merchant_risk') {
    return {
      decision: ['flag_for_investigation', 'no_action'],
      schema: [
        { name: 'merchant_id', type: 'string', required: true, description: 'Card acceptor ID', example: 'M-00415520' },
        { name: 'as_of_date', type: 'string', required: true, description: 'Scoring date (YYYY-MM-DD)', example: '2026-11-17' },
      ],
      sample: { merchant_id: 'M-00415520', as_of_date: '2026-11-17' },
    };
  }
  return {
    decision: seed.problemType === 'false_decline' ? ['recommend_approve', 'keep_decline'] : ['step_up_3ds', 'approve'],
    schema: [
      { name: 'txn_id', type: 'string', required: true, description: 'Transaction identifier', example: 'TX7C02B9E1' },
      { name: 'pan_token', type: 'string', required: true, description: 'Tokenized PAN, used to look up card features', example: 'tok_8a2e61b0c4' },
      { name: 'merchant_id', type: 'string', required: true, description: 'Card acceptor ID', example: 'M-00918244' },
      { name: 'amount_usd', type: 'number', required: true, description: 'Authorization amount', example: 842.5 },
      { name: 'mcc', type: 'string', required: true, description: 'Merchant category code', example: '5967' },
      { name: 'acq_country', type: 'string', required: true, description: 'Acquirer country (ISO alpha-2)', example: 'RO' },
      { name: 'pos_entry_mode', type: 'string', required: false, description: '81 for e-commerce', example: '81' },
      { name: 'auth_ts', type: 'timestamp', required: true, description: 'Authorization time', example: '2026-11-18T09:14:03Z' },
    ],
    sample: { txn_id: 'TX7C02B9E1', pan_token: 'tok_8a2e61b0c4', merchant_id: 'M-00918244', amount_usd: 842.5, mcc: '5967', acq_country: 'RO', pos_entry_mode: '81', auth_ts: '2026-11-18T09:14:03Z' },
  };
}

export function makeDeployment(s: ProjectState, status: Deployment['status']): Deployment {
  const sel = s.selection!;
  const exp = s.experiments.find((e) => e.id === sel.experimentId)!;
  const { schema, sample } = inputSchemaFor(s.seed);
  const env = s.project.constraints.deployTarget;
  return {
    id: `dep-${s.project.id}-${exp.index}`,
    projectId: s.project.id,
    projectName: s.project.name,
    experimentId: exp.id,
    modelVersion: `${s.project.id}-v1.${exp.index}`,
    environment: env,
    status,
    endpoint: status === 'live' ? `https://${env}.mlstudio.visa.internal/v1/models/${s.project.id}:predict` : undefined,
    createdAt: iso(new Date()),
    liveAt: status === 'live' ? iso(new Date()) : undefined,
    threshold: 0.62,
    inputSchema: schema,
    samplePayload: sample,
    checks: [
      { name: 'Out-of-time performance', status: status === 'awaiting_approval' ? 'pending' : 'pass', detail: `${(exp.metrics!.primary - 0.8).toFixed(1)}% ${s.project.spec.primaryMetric.toLowerCase()} on ${s.project.spec.timeSplit.outOfTime}` },
      { name: 'Score stability', status: status === 'awaiting_approval' ? 'pending' : 'pass', detail: 'Max monthly PSI 0.04 (limit 0.10)' },
      { name: 'Latency', status: status === 'awaiting_approval' ? 'pending' : 'pass', detail: `p99 ${exp.metrics!.latencyP99Ms} ms (budget ${s.project.constraints.maxLatencyMs} ms)` },
      { name: 'Explainability', status: status === 'awaiting_approval' ? 'pending' : 'pass', detail: 'Top-3 reason codes returned for every score' },
      { name: 'Excluded columns', status: status === 'awaiting_approval' ? 'pending' : 'pass', detail: s.project.constraints.excludedColumns.length ? `None of ${s.project.constraints.excludedColumns.join(', ')} used` : 'No exclusions set' },
      { name: 'Model documentation', status: status === 'awaiting_approval' ? 'pending' : 'warn', detail: 'Model card drafted. Model risk review needed before production only.' },
    ],
    traffic: status === 'live' ? { requestsLastHour: 18_420, p50Ms: 6, p99Ms: exp.metrics!.latencyP99Ms, errorRatePct: 0.02 } : undefined,
  };
}

export function makeSelection(s: ProjectState): ModelSelection {
  const done = s.experiments.filter((e) => e.metrics);
  const sorted = done.slice().sort((a, b) => b.metrics!.primary - a.metrics!.primary);
  const withinLatency = sorted.filter((e) => e.metrics!.latencyP99Ms <= s.project.constraints.maxLatencyMs);
  const best = withinLatency[0];
  const alts = sorted.filter((e) => e.id !== best.id).slice(0, 3);
  return {
    experimentId: best.id,
    selectedBy: 'Researcher',
    selectedAt: iso(new Date()),
    rationale: `Run ${best.index} (${best.modelFamily}) has the best ${s.project.spec.primaryMetric.toLowerCase()} on validation at **${best.metrics!.primary}%**, up **${(best.metrics!.primary - done[0].metrics!.primary).toFixed(1)} points** on the baseline. Its p99 latency of ${best.metrics!.latencyP99Ms} ms is within the ${s.project.constraints.maxLatencyMs} ms budget, and it uses only features that passed validation. The loop stopped because ${s.experiments.length >= s.project.constraints.maxExperiments ? 'it reached the experiment limit' : `${s.project.constraints.earlyStopAfter} runs in a row brought no improvement`}.`,
    alternatives: alts.map((e) => ({
      experimentId: e.id,
      reason: e.metrics!.latencyP99Ms > s.project.constraints.maxLatencyMs ? `Over the latency budget (${e.metrics!.latencyP99Ms} ms).` : `${(best.metrics!.primary - e.metrics!.primary).toFixed(1)} points lower.`,
    })),
  };
}

function buildState(seed: ProjectSeed, now: Date): ProjectState {
  const created = new Date(now.getTime() - seed.createdDaysAgo * DAY - 3600_000 * 3);
  const { hypotheses, subs, features } = expandHypotheses(seed);
  const project: Project = {
    id: seed.id,
    name: seed.name,
    problemType: seed.problemType,
    owner: seed.owner,
    statement: seed.statement,
    spec: seed.spec,
    constraints: seed.constraints,
    status: 'running',
    currentLoop: 'features',
    loops: {
      features: { status: 'not_started', progress: 0, summary: 'Not started' },
      models: { status: 'not_started', progress: 0, summary: 'Waits for features' },
      deploy: { status: 'not_started', progress: 0, summary: 'Waits for a selected model' },
    },
    pendingDecisions: 0,
    createdAt: iso(created),
    updatedAt: iso(created),
  };
  const s: ProjectState = { project, seed, hypotheses, subs, features, vfpJobs: [], experiments: [], selection: null, deployment: null, events: [], artifactVersions: {}, rand: rng(seed.id.length * 977 + seed.createdDaysAgo), cooldown: 0 };
  const at = (frac: number) => iso(new Date(created.getTime() + (now.getTime() - created.getTime()) * frac));

  makeEvent(s, { agent: 'orchestrator', loop: 'project', kind: 'milestone', message: 'Project created from the problem statement. Spec and constraints drafted.', tool: 'skill:draft-spec', artifactPath: 'project/problem_statement.md', ts: at(0) });
  if (seed.id === 'token-abuse') {
    project.status = 'draft';
    project.currentLoop = null;
    return s;
  }
  makeEvent(s, { agent: 'hypothesis', loop: 'features', kind: 'artifact', message: `Proposed ${hypotheses.length} hypotheses with evidence sampled from VisaNet.`, tool: 'skill:hypothesis-gen', artifactPath: 'features/hypothesis.md', ts: at(0.05) });

  if (seed.id === 'xb-false-declines') {
    project.status = 'needs_review';
    project.loops.features = { status: 'waiting', progress: 0.2, summary: `${hypotheses.length} hypotheses waiting for your review`, startedAt: at(0.02) };
    makeEvent(s, { agent: 'hypothesis', loop: 'features', kind: 'decision', message: 'Waiting for you to accept or reject the proposed hypotheses before building features.', ts: at(0.06) });
    return s;
  }

  const allFeat = features.filter((f) => hypotheses.find((h) => h.id === f.hypothesisId)?.status === 'accepted');
  makeEvent(s, { agent: 'sub_hypothesis', loop: 'features', kind: 'artifact', message: `Broke accepted hypotheses into ${subs.filter((x) => x.status === 'accepted').length} sub-hypotheses.`, tool: 'skill:sub-hypothesis-gen', artifactPath: 'features/sub_hypothesis.md', ts: at(0.12) });
  makeEvent(s, { agent: 'feature_engineer', loop: 'features', kind: 'artifact', message: `Designed ${allFeat.length} features and wrote their logic.`, tool: 'skill:pyspark-codegen', artifactPath: 'features/feature_catalog.md', ts: at(0.2) });
  const job: VfpJob = {
    id: `vfp-${seed.id.slice(0, 3)}-${Math.floor(4000 + seed.createdDaysAgo * 37)}`,
    status: 'succeeded',
    featureIds: allFeat.map((f) => f.id),
    submittedAt: at(0.22),
    finishedAt: at(0.35),
    partitionsDone: 21,
    partitionsTotal: 21,
    rowsProcessed: 2_140_000_000,
    constraintsApplied: [
      `Data window ${seed.constraints.dataWindow.from} to ${seed.constraints.dataWindow.to}`,
      `Windows limited to ${seed.constraints.featureWindows.join(', ')}`,
      seed.constraints.excludedColumns.length ? `Excluded columns: ${seed.constraints.excludedColumns.join(', ')}` : 'No excluded columns',
      `At most ${seed.constraints.maxFeatures} features`,
      'Point-in-time joins only (no future data)',
    ],
  };
  s.vfpJobs.push(job);
  makeEvent(s, { agent: 'vfp_builder', loop: 'features', kind: 'info', message: `Submitted VFP job ${job.id} for ${allFeat.length} features, ${job.partitionsTotal} monthly partitions.`, tool: 'VFP.submit_job', artifactPath: 'features/vfp_build_spec.yaml', ts: at(0.22) });

  if (seed.id === 'merchant-compromise') {
    job.status = 'running';
    job.finishedAt = undefined;
    job.partitionsDone = 11;
    job.rowsProcessed = 1_020_000_000;
    allFeat.forEach((f) => (f.vfpJobId = job.id));
    project.loops.features = { status: 'running', progress: 0.55, summary: `VFP backfill 11 of 21 partitions`, startedAt: at(0.02) };
    makeEvent(s, { agent: 'vfp_builder', loop: 'features', kind: 'info', message: 'Backfill at 11 of 21 partitions (Nov 2025).', tool: 'VFP.backfill', ts: at(0.9) });
    return s;
  }

  makeEvent(s, { agent: 'validator', loop: 'features', kind: 'artifact', message: `Validated ${allFeat.length} features. ${allFeat.filter((f) => f.stats?.leakage === 'fixed').length} leakage issue fixed, ${allFeat.filter((f) => f.buildStatus === 'excluded').length} excluded for drift.`, tool: 'skill:leakage-check', artifactPath: 'features/validation_report.md', ts: at(0.36) });
  project.loops.features = { status: 'done', progress: 1, summary: `${allFeat.filter((f) => f.buildStatus === 'ready').length} features ready in the Feature Store`, startedAt: at(0.02), finishedAt: at(0.37) };
  makeEvent(s, { agent: 'orchestrator', loop: 'features', kind: 'milestone', message: 'Feature loop complete. Starting the model loop.', ts: at(0.37) });

  // Model loop history
  const cfg = { projectId: seed.id, baseline: seed.model.baseline, ceiling: seed.model.ceiling, featureCount: allFeat.filter((f) => f.buildStatus === 'ready').length };
  for (let i = 0; i < seed.model.seedRuns; i++) {
    const frac = 0.38 + (0.55 * (i + 1)) / seed.model.seedRuns;
    const e = nextExperiment(cfg, s.experiments, s.rand, new Date(at(frac)));
    s.experiments.push(e);
    if (e.outcome === 'kept' && i > 0) makeEvent(s, { agent: 'researcher', loop: 'models', kind: 'info', message: `Run ${e.index} improved to **${e.metrics!.primary}%** (+${e.delta!.toFixed(1)}): ${e.change}.`, tool: 'skill:analyze-run', artifactPath: 'models/experiment_log.md', ts: e.finishedAt });
  }
  project.currentLoop = 'models';
  project.loops.models = { status: 'running', progress: s.experiments.length / seed.constraints.maxExperiments, summary: `Run ${s.experiments.length} of up to ${seed.constraints.maxExperiments}`, startedAt: at(0.38) };

  if (seed.id === 'friendly-fraud') {
    s.selection = makeSelection(s);
    project.loops.models = { status: 'done', progress: 1, summary: `Selected run ${s.experiments.find((e) => e.id === s.selection!.experimentId)!.index}`, startedAt: at(0.38), finishedAt: at(0.93) };
    makeEvent(s, { agent: 'researcher', loop: 'models', kind: 'artifact', message: 'Stopped the loop and selected the best model.', tool: 'skill:select-model', artifactPath: 'models/model_selection.md', ts: at(0.93) });
    s.deployment = makeDeployment(s, 'live');
    s.deployment.liveAt = at(0.96);
    s.deployment.createdAt = at(0.94);
    project.currentLoop = 'deploy';
    project.status = 'deployed';
    project.loops.deploy = { status: 'done', progress: 1, summary: `Live in ${s.deployment.environment.toUpperCase()}`, startedAt: at(0.94), finishedAt: at(0.96) };
    makeEvent(s, { agent: 'deployer', loop: 'deploy', kind: 'artifact', message: 'Readiness checks passed. 1 warning: model risk review needed before production.', tool: 'skill:readiness-checks', artifactPath: 'deploy/readiness_report.md', ts: at(0.95) });
    makeEvent(s, { agent: 'deployer', loop: 'deploy', kind: 'milestone', message: `Model live in UAT. Inference API ready to test.`, tool: 'deploy.lower_env', artifactPath: 'deploy/inference_api.md', ts: at(0.96) });
    s.artifactVersions['deploy/deployment.yaml'] = { version: 2, updatedAt: at(0.96) };
  }
  return s;
}

export function createInitialState(): Map<string, ProjectState> {
  const now = new Date();
  const m = new Map<string, ProjectState>();
  SEEDS.forEach((seed) => m.set(seed.id, buildState(seed, now)));
  return m;
}
