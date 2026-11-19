import type { MlStudioApi } from '../client';
import type {
  AgentEvent,
  Constraints,
  Decision,
  InferenceError,
  InferenceResponse,
  ProblemSpec,
  ProblemType,
  Project,
  ProjectSummary,
} from '../types';
import { listArtifacts, visibleFeatures } from './artifacts';
import { nextExperiment, rng } from './experiments';
import { AGENTS, CATALOG } from './reference';
import { expandHypotheses, SEEDS, type ProjectSeed } from './seed';
import { createInitialState, inputSchemaFor, iso, makeDeployment, makeEvent, makeSelection, type ProjectState } from './store';

const TICK_MS = 2600;
const clone = <T,>(x: T): T => structuredClone(x);
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

export function createMockApi(): MlStudioApi {
  const db = createInitialState();
  const listeners = new Set<{ projectId: string | null; fn: (e: AgentEvent) => void }>();

  function emit(s: ProjectState, e: Parameters<typeof makeEvent>[1]) {
    const ev = makeEvent(s, e);
    listeners.forEach((l) => (l.projectId === null || l.projectId === ev.projectId) && l.fn(clone(ev)));
  }
  function get(id: string): ProjectState {
    const s = db.get(id);
    if (!s) throw new Error(`Project ${id} not found`);
    return s;
  }
  function decisionsFor(s: ProjectState): Decision[] {
    const out: Decision[] = [];
    const proposed = s.hypotheses.filter((h) => h.status === 'proposed');
    if (proposed.length && s.project.status !== 'draft')
      out.push({ id: `${s.project.id}-hyp`, projectId: s.project.id, projectName: s.project.name, loop: 'features', title: `Review ${proposed.length} proposed hypothes${proposed.length === 1 ? 'is' : 'es'}`, detail: 'Feature building starts once every hypothesis is accepted or rejected.', link: `/projects/${s.project.id}/features`, createdAt: s.project.loops.features.startedAt ?? s.project.createdAt });
    if (s.deployment?.status === 'awaiting_approval')
      out.push({ id: `${s.project.id}-dep`, projectId: s.project.id, projectName: s.project.name, loop: 'deploy', title: `Approve deployment of ${s.deployment.modelVersion} to ${s.deployment.environment.toUpperCase()}`, detail: 'The Researcher selected this model. The Deployer is waiting for your approval.', link: `/projects/${s.project.id}/deploy`, createdAt: s.deployment.createdAt });
    return out;
  }
  function summary(s: ProjectState): ProjectSummary {
    const p = s.project;
    const best = s.experiments.filter((e) => e.outcome === 'kept' && e.metrics).slice(-1)[0];
    const sel = s.selection ? s.experiments.find((e) => e.id === s.selection!.experimentId) : undefined;
    const head = sel ?? best;
    return clone({
      id: p.id, name: p.name, problemType: p.problemType, owner: p.owner, status: p.status, currentLoop: p.currentLoop, loops: p.loops,
      headline: head?.metrics ? { metricName: s.seed.model.metricName, value: head.metrics.primary, baseline: s.experiments[0].metrics!.primary, unit: s.seed.model.unit } : undefined,
      pendingDecisions: decisionsFor(s).length, lastActivity: p.lastActivity, createdAt: p.createdAt, updatedAt: p.updatedAt,
    });
  }
  function fullProject(s: ProjectState): Project {
    return { ...summary(s), statement: s.project.statement, spec: clone(s.project.spec), constraints: clone(s.project.constraints) };
  }

  /* --------------------------- simulation --------------------------- */

  function startFeatureBuild(s: ProjectState) {
    const feats = visibleFeatures(s).filter((f) => f.buildStatus === 'spec' || f.buildStatus === 'queued');
    s.subs.forEach((x) => { if (s.hypotheses.find((h) => h.id === x.hypothesisId)?.status === 'accepted') x.status = 'accepted'; });
    emit(s, { agent: 'sub_hypothesis', loop: 'features', kind: 'artifact', message: `Broke ${s.hypotheses.filter((h) => h.status === 'accepted').length} accepted hypotheses into ${s.subs.filter((x) => x.status === 'accepted').length} sub-hypotheses.`, tool: 'skill:sub-hypothesis-gen', artifactPath: 'features/sub_hypothesis.md' });
    emit(s, { agent: 'feature_engineer', loop: 'features', kind: 'artifact', message: `Designed ${feats.length} features and wrote their logic within your constraints.`, tool: 'skill:pyspark-codegen', artifactPath: 'features/feature_catalog.md' });
    const c = s.project.constraints;
    const job = {
      id: `vfp-${s.project.id.slice(0, 3)}-${5000 + Math.floor(s.rand() * 900)}`, status: 'running' as const, featureIds: feats.map((f) => f.id), submittedAt: iso(new Date()), partitionsDone: 0, partitionsTotal: 21, rowsProcessed: 0,
      constraintsApplied: [`Data window ${c.dataWindow.from} to ${c.dataWindow.to}`, `Windows limited to ${c.featureWindows.join(', ')}`, c.excludedColumns.length ? `Excluded columns: ${c.excludedColumns.join(', ')}` : 'No excluded columns', `At most ${c.maxFeatures} features`, 'Point-in-time joins only (no future data)'],
    };
    feats.forEach((f) => { f.buildStatus = 'building'; f.vfpJobId = job.id; });
    s.vfpJobs.push(job);
    s.project.status = 'running';
    s.project.loops.features = { ...s.project.loops.features, status: 'running', progress: 0.35, summary: 'VFP backfill starting' };
    emit(s, { agent: 'vfp_builder', loop: 'features', kind: 'info', message: `Submitted VFP job ${job.id} for ${feats.length} features.`, tool: 'VFP.submit_job', artifactPath: 'features/vfp_build_spec.yaml' });
  }

  function stepFeatures(s: ProjectState) {
    const job = s.vfpJobs.find((j) => j.status === 'running');
    if (!job) return;
    job.partitionsDone = Math.min(job.partitionsTotal, job.partitionsDone + 1 + Math.floor(s.rand() * 2));
    job.rowsProcessed += 90_000_000 + Math.floor(s.rand() * 30_000_000);
    const frac = job.partitionsDone / job.partitionsTotal;
    s.project.loops.features.progress = 0.35 + frac * 0.6;
    s.project.loops.features.summary = `VFP backfill ${job.partitionsDone} of ${job.partitionsTotal} partitions`;
    s.features.filter((f) => f.vfpJobId === job.id && f.buildStatus === 'queued').forEach((f) => (f.buildStatus = 'building'));
    if (job.partitionsDone % 4 === 0) emit(s, { agent: 'vfp_builder', loop: 'features', kind: 'info', message: `Backfill at ${job.partitionsDone} of ${job.partitionsTotal} partitions.`, tool: 'VFP.backfill' });
    if (job.partitionsDone >= job.partitionsTotal) {
      job.status = 'succeeded';
      job.finishedAt = iso(new Date());
      s.features.filter((f) => job.featureIds.includes(f.id) || f.buildStatus === 'spec').forEach((f) => {
        f.buildStatus = 'ready';
        f.stats = { informationValue: Math.round((0.1 + s.rand() * 0.4) * 100) / 100, coveragePct: Math.round((88 + s.rand() * 12) * 10) / 10, psi: Math.round(s.rand() * 0.09 * 100) / 100, leakage: 'pass' };
      });
      emit(s, { agent: 'vfp_builder', loop: 'features', kind: 'info', message: `VFP job ${job.id} succeeded. Features registered in the Feature Store.`, tool: 'VFP.register' });
      emit(s, { agent: 'validator', loop: 'features', kind: 'artifact', message: 'Validated all features: no leakage, coverage above 88%, drift within limits.', tool: 'skill:leakage-check', artifactPath: 'features/validation_report.md' });
      s.project.loops.features = { ...s.project.loops.features, status: 'done', progress: 1, summary: `${s.features.filter((f) => f.buildStatus === 'ready').length} features ready in the Feature Store`, finishedAt: iso(new Date()) };
      s.project.currentLoop = 'models';
      s.project.loops.models = { status: 'running', progress: 0, summary: 'Starting the auto-research loop', startedAt: iso(new Date()) };
      emit(s, { agent: 'orchestrator', loop: 'features', kind: 'milestone', message: 'Feature loop complete. Starting the model loop.' });
    }
  }

  function stepModels(s: ProjectState) {
    const c = s.project.constraints;
    const training = s.experiments.find((e) => e.status === 'training');
    const cfg = { projectId: s.project.id, baseline: s.seed.model.baseline, ceiling: s.seed.model.ceiling, featureCount: s.features.filter((f) => f.buildStatus === 'ready').length };
    if (training) {
      const done = nextExperiment(cfg, s.experiments.filter((e) => e !== training), s.rand, new Date());
      Object.assign(training, { ...done, hypothesis: training.hypothesis, change: training.change, modelFamily: training.modelFamily, params: training.params, startedAt: training.startedAt });
      emit(s, training.outcome === 'kept'
        ? { agent: 'researcher', loop: 'models', kind: 'info', message: `Run ${training.index} improved to **${training.metrics!.primary}%** (${training.delta! >= 0 ? '+' : ''}${training.delta!.toFixed(1)}): ${training.change}. Keeping it.`, tool: 'skill:analyze-run', artifactPath: 'models/experiment_log.md' }
        : { agent: 'trainer', loop: 'models', kind: 'info', message: `Run ${training.index} finished at ${training.metrics!.primary}% (${training.delta!.toFixed(1)}). Discarded.`, tool: 'train.gpu_job', artifactPath: 'models/leaderboard.csv' });
      const lastKept = s.experiments.filter((e) => e.outcome === 'kept').slice(-1)[0];
      const since = s.experiments.length - lastKept.index;
      const gpu = s.experiments.reduce((a, e) => a + e.gpuHours, 0);
      s.project.loops.models.progress = Math.min(0.99, s.experiments.length / c.maxExperiments);
      s.project.loops.models.summary = `Run ${s.experiments.length} of up to ${c.maxExperiments} · best ${lastKept.metrics!.primary}%`;
      if (since >= c.earlyStopAfter || s.experiments.length >= c.maxExperiments || gpu >= c.computeBudgetGpuHours) finishModels(s);
      return;
    }
    // plan the next run
    const planned = nextExperiment(cfg, s.experiments, rng(s.experiments.length * 31 + 7), new Date());
    s.experiments.push({ ...planned, status: 'training', metrics: undefined, delta: undefined, outcome: 'pending', conclusion: undefined, finishedAt: undefined, startedAt: iso(new Date()) });
    emit(s, { agent: 'researcher', loop: 'models', kind: 'info', message: `Planned run ${planned.index}: ${planned.change}. ${planned.hypothesis}`, tool: 'skill:plan-experiment' });
  }

  function finishModels(s: ProjectState) {
    s.selection = makeSelection(s);
    const e = s.experiments.find((x) => x.id === s.selection!.experimentId)!;
    s.project.loops.models = { ...s.project.loops.models, status: 'done', progress: 1, summary: `Selected run ${e.index} at ${e.metrics!.primary}%`, finishedAt: iso(new Date()) };
    emit(s, { agent: 'researcher', loop: 'models', kind: 'artifact', message: `Stopped the loop. Selected run ${e.index} (${e.modelFamily}) at **${e.metrics!.primary}%**.`, tool: 'skill:select-model', artifactPath: 'models/model_selection.md' });
    s.project.currentLoop = 'deploy';
    if (s.project.constraints.requireApprovalBeforeDeploy) {
      s.deployment = makeDeployment(s, 'awaiting_approval');
      s.project.status = 'needs_review';
      s.project.loops.deploy = { status: 'waiting', progress: 0.1, summary: 'Waiting for your approval', startedAt: iso(new Date()) };
      emit(s, { agent: 'deployer', loop: 'deploy', kind: 'decision', message: `Packaged ${s.deployment.modelVersion}. Waiting for your approval to deploy to ${s.deployment.environment.toUpperCase()}.`, tool: 'package-model', artifactPath: 'deploy/deployment.yaml' });
    } else {
      s.deployment = makeDeployment(s, 'packaging');
      s.project.loops.deploy = { status: 'running', progress: 0.2, summary: 'Packaging the model', startedAt: iso(new Date()) };
    }
  }

  function stepDeploy(s: ProjectState) {
    const d = s.deployment;
    if (!d) return;
    const order = ['packaging', 'checking', 'deploying', 'live'] as const;
    const i = order.indexOf(d.status as (typeof order)[number]);
    if (i < 0 || d.status === 'live') return;
    const next = order[i + 1];
    if (next === 'checking') {
      const fresh = makeDeployment(s, 'checking');
      d.checks = fresh.checks;
      d.status = 'checking';
      s.project.loops.deploy = { ...s.project.loops.deploy, status: 'running', progress: 0.5, summary: 'Running readiness checks' };
      emit(s, { agent: 'deployer', loop: 'deploy', kind: 'artifact', message: 'Readiness checks: 5 passed, 1 warning (model risk review before production).', tool: 'skill:readiness-checks', artifactPath: 'deploy/readiness_report.md' });
    } else if (next === 'deploying') {
      d.status = 'deploying';
      s.project.loops.deploy = { ...s.project.loops.deploy, progress: 0.75, summary: `Deploying to ${d.environment.toUpperCase()}` };
      emit(s, { agent: 'deployer', loop: 'deploy', kind: 'info', message: `Deploying ${d.modelVersion} to ${d.environment.toUpperCase()} with 2 replicas.`, tool: 'deploy.lower_env' });
    } else if (next === 'live') {
      const live = makeDeployment(s, 'live');
      Object.assign(d, { status: 'live', endpoint: live.endpoint, liveAt: iso(new Date()), traffic: { requestsLastHour: 0, p50Ms: 6, p99Ms: live.traffic!.p99Ms, errorRatePct: 0 } });
      s.project.status = 'deployed';
      s.project.loops.deploy = { ...s.project.loops.deploy, status: 'done', progress: 1, summary: `Live in ${d.environment.toUpperCase()}`, finishedAt: iso(new Date()) };
      emit(s, { agent: 'deployer', loop: 'deploy', kind: 'milestone', message: `${d.modelVersion} is live in ${d.environment.toUpperCase()}. The inference API is ready to test.`, tool: 'deploy.lower_env', artifactPath: 'deploy/inference_api.md' });
    }
  }

  function stepNewProject(s: ProjectState) {
    // A newly created project: the Hypothesis agent proposes hypotheses after a short delay.
    if (s.hypotheses.length === 0) {
      const template = templateFor(s.project.problemType);
      const { hypotheses, subs, features } = expandHypotheses({ ...template, id: s.project.id });
      hypotheses.forEach((h) => { h.status = 'proposed'; h.reviewedBy = undefined; });
      subs.forEach((x) => (x.status = 'proposed'));
      features.forEach((f) => { f.buildStatus = 'spec'; f.stats = undefined; f.excludedReason = undefined; f.vfpJobId = undefined; });
      s.hypotheses = hypotheses; s.subs = subs; s.features = features;
      s.project.status = 'needs_review';
      s.project.loops.features = { ...s.project.loops.features, status: 'waiting', progress: 0.2, summary: `${hypotheses.length} hypotheses waiting for your review` };
      emit(s, { agent: 'hypothesis', loop: 'features', kind: 'artifact', message: `Proposed ${hypotheses.length} hypotheses with evidence sampled from VisaNet.`, tool: 'skill:hypothesis-gen', artifactPath: 'features/hypothesis.md' });
      emit(s, { agent: 'hypothesis', loop: 'features', kind: 'decision', message: 'Waiting for you to accept or reject the proposed hypotheses.' });
    }
  }

  function templateFor(t: ProblemType): ProjectSeed {
    const byType: Record<ProblemType, string> = { fraud: 'cnp-fraud', false_decline: 'xb-false-declines', friendly_fraud: 'friendly-fraud', merchant_risk: 'merchant-compromise', other: 'cnp-fraud' };
    const base = SEEDS.find((x) => x.id === byType[t])!;
    return { ...clone(base), hyps: clone(base.hyps).filter((h) => h.subs.length > 0).slice(0, 4) };
  }

  setInterval(() => {
    db.forEach((s) => {
      if (s.cooldown > 0) { s.cooldown--; return; }
      const L = s.project.loops;
      if (s.project.status === 'draft' || s.project.status === 'paused') return;
      if (L.features.status === 'running' && s.hypotheses.length === 0) return stepNewProject(s);
      if (L.features.status === 'running') return stepFeatures(s);
      if (L.models.status === 'running') return stepModels(s);
      if (L.deploy.status === 'running') return stepDeploy(s);
    });
    // Live traffic on deployed models
    db.forEach((s) => { if (s.deployment?.status === 'live' && s.deployment.traffic) s.deployment.traffic.requestsLastHour += Math.floor(40 + Math.random() * 90); });
  }, TICK_MS);

  /* ------------------------------ API ------------------------------- */

  return {
    async listProjects() { await delay(); return [...db.values()].map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async getProject(id) { await delay(); return fullProject(get(id)); },

    async draftSpec({ statement, problemType }) {
      await delay(900);
      const seed = templateFor(problemType);
      const name = suggestName(statement, problemType);
      const spec: ProblemSpec = clone(seed.spec);
      const constraints: Constraints = clone(seed.constraints);
      return { name, spec, constraints };
    },

    async createProject(input) {
      await delay(300);
      const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) + '-' + Math.floor(Math.random() * 900 + 100);
      const now = iso(new Date());
      const seed: ProjectSeed = { ...templateFor(input.problemType), id, name: input.name, problemType: input.problemType, statement: input.statement, spec: input.spec, constraints: input.constraints, owner: 'Priya Raman', createdDaysAgo: 0 };
      const project: Project = {
        id, name: input.name, problemType: input.problemType, owner: 'Priya Raman', statement: input.statement, spec: input.spec, constraints: input.constraints,
        status: input.start ? 'running' : 'draft', currentLoop: input.start ? 'features' : null,
        loops: { features: input.start ? { status: 'running', progress: 0.05, summary: 'Hypothesis agent is reading the problem', startedAt: now } : { status: 'not_started', progress: 0, summary: 'Not started' }, models: { status: 'not_started', progress: 0, summary: 'Waits for features' }, deploy: { status: 'not_started', progress: 0, summary: 'Waits for a selected model' } },
        pendingDecisions: 0, createdAt: now, updatedAt: now,
      };
      const s: ProjectState = { project, seed, hypotheses: [], subs: [], features: [], vfpJobs: [], experiments: [], selection: null, deployment: null, events: [], artifactVersions: {}, rand: rng(id.length * 131), cooldown: 1 };
      db.set(id, s);
      emit(s, { agent: 'orchestrator', loop: 'project', kind: 'milestone', message: input.start ? 'Project created. Starting the feature loop.' : 'Project saved as a draft.', tool: 'skill:plan-project', artifactPath: 'project/problem_statement.md' });
      return fullProject(s);
    },

    async updateConstraints(id, c) {
      await delay();
      const s = get(id);
      s.project.constraints = clone(c);
      emit(s, { agent: 'orchestrator', loop: 'project', kind: 'artifact', message: 'Constraints updated. Agents will use them from the next step.', artifactPath: 'project/constraints.yaml' });
      return fullProject(s);
    },

    async setLoopPaused(id, loop, paused) {
      await delay();
      const s = get(id);
      if (s.project.status === 'draft' && !paused) {
        s.project.status = 'running';
        s.project.currentLoop = 'features';
        s.project.loops.features = { status: 'running', progress: 0.05, summary: 'Hypothesis agent is reading the problem', startedAt: iso(new Date()) };
        s.cooldown = 1;
        emit(s, { agent: 'orchestrator', loop: 'project', kind: 'milestone', message: 'Project started. Feature loop running.' });
        return fullProject(s);
      }
      const L = s.project.loops[loop];
      if (paused && L.status === 'running') { L.status = 'paused'; s.project.status = 'paused'; }
      if (!paused && L.status === 'paused') { L.status = 'running'; s.project.status = 'running'; }
      emit(s, { agent: 'orchestrator', loop, kind: 'info', message: `${paused ? 'Paused' : 'Resumed'} the ${loop === 'features' ? 'feature' : loop === 'models' ? 'model' : 'deployment'} loop.` });
      return fullProject(s);
    },

    async listHypotheses(id) { await delay(); return clone(get(id).hypotheses); },
    async listSubHypotheses(id) { await delay(); return clone(get(id).subs); },
    async reviewHypothesis(id, hid, status) {
      await delay();
      const s = get(id);
      const h = s.hypotheses.find((x) => x.id === hid)!;
      h.status = status;
      h.reviewedBy = status === 'proposed' ? undefined : 'Priya Raman';
      s.subs.filter((x) => x.hypothesisId === hid).forEach((x) => (x.status = status === 'accepted' ? 'accepted' : 'proposed'));
      emit(s, { agent: 'hypothesis', loop: 'features', kind: 'artifact', message: `${hid} ${status === 'proposed' ? 'moved back to proposed' : status} by Priya Raman.`, artifactPath: 'features/hypothesis.md' });
      if (s.hypotheses.every((x) => x.status !== 'proposed') && s.project.loops.features.status === 'waiting') {
        if (s.hypotheses.some((x) => x.status === 'accepted')) startFeatureBuild(s);
      }
      return clone(h);
    },
    async listFeatures(id) { await delay(); return clone(visibleFeatures(get(id))); },
    async listVfpJobs(id) { await delay(); return clone(get(id).vfpJobs).reverse(); },

    async listExperiments(id) { await delay(); return clone(get(id).experiments); },
    async getModelLoopStats(id) {
      await delay();
      const s = get(id);
      const kept = s.experiments.filter((e) => e.outcome === 'kept').slice(-1)[0];
      const done = s.experiments.filter((e) => e.status === 'completed').length;
      return {
        gpuHoursUsed: Math.round(s.experiments.reduce((a, e) => a + e.gpuHours, 0) * 10) / 10,
        gpuHoursBudget: s.project.constraints.computeBudgetGpuHours,
        runsWithoutImprovement: kept ? done - kept.index : 0,
        earlyStopAfter: s.project.constraints.earlyStopAfter,
        maxExperiments: s.project.constraints.maxExperiments,
        stopReason: s.project.loops.models.status === 'done' ? `No improvement in ${s.project.constraints.earlyStopAfter} consecutive runs` : undefined,
      };
    },
    async getModelSelection(id) { await delay(); return clone(get(id).selection); },

    async listDeployments() { await delay(); return [...db.values()].filter((s) => s.deployment).map((s) => clone(s.deployment!)); },
    async getDeployment(id) { await delay(); return clone(get(id).deployment); },
    async approveDeployment(id) {
      await delay();
      const s = get(id);
      if (!s.deployment) throw new Error('No deployment waiting for approval');
      s.deployment.status = 'packaging';
      s.project.status = 'running';
      s.project.loops.deploy = { ...s.project.loops.deploy, status: 'running', progress: 0.3, summary: 'Packaging the model' };
      emit(s, { agent: 'deployer', loop: 'deploy', kind: 'info', message: `Deployment approved by Priya Raman. Packaging ${s.deployment.modelVersion}.`, tool: 'package-model' });
      return clone(s.deployment);
    },
    async invoke(id, payload): Promise<InferenceResponse | InferenceError> {
      const s = get(id);
      const d = s.deployment;
      await delay(80);
      if (!d || d.status !== 'live') return { error: 'The model is not live yet.' };
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return { error: 'Payload must be a JSON object.' };
      const p = payload as Record<string, unknown>;
      for (const f of d.inputSchema) {
        const v = p[f.name];
        if (f.required && (v === undefined || v === null || v === '')) return { error: `Missing required field “${f.name}”.`, field: f.name };
        if (v !== undefined && f.type === 'number' && typeof v !== 'number') return { error: `“${f.name}” must be a number.`, field: f.name };
      }
      const { decision } = inputSchemaFor(s.seed);
      const r = rng(JSON.stringify(p).length * 7 + String(p[d.inputSchema[0].name]).length);
      const amount = typeof p.amount_usd === 'number' ? p.amount_usd : 100;
      let z = -1.2 + Math.log10(Math.max(1, amount)) * 0.55 + r() * 1.6;
      if (['5967', '4829', '5816'].includes(String(p.mcc))) z += 0.9;
      if (p.acq_country && !['US'].includes(String(p.acq_country))) z += 0.5;
      if (p.reason_code === '13.1') z += 0.4;
      const score = Math.round((1 / (1 + Math.exp(-z))) * 1000) / 1000;
      const feats = visibleFeatures(s).filter((f) => f.buildStatus === 'ready' && f.stats).sort((a, b) => b.stats!.informationValue - a.stats!.informationValue).slice(0, 3);
      return {
        requestId: `req_${Math.random().toString(36).slice(2, 10)}`,
        modelVersion: d.modelVersion,
        score,
        threshold: d.threshold,
        decision: score >= d.threshold ? decision[0] : decision[1],
        reasons: feats.map((f, i) => ({ feature: f.name, contribution: Math.round((0.32 - i * 0.09 + r() * 0.05) * 100) / 100, text: f.description })),
        latencyMs: 6 + Math.round(r() * 9),
      };
    },

    async listArtifacts(id) { await delay(); return listArtifacts(get(id)).map(({ content: _c, ...meta }) => meta); },
    async getArtifact(id, path) {
      await delay();
      const a = listArtifacts(get(id)).find((x) => x.path === path);
      if (!a) throw new Error(`Artifact ${path} not found`);
      return a;
    },
    async listEvents(id, limit = 100) {
      await delay(60);
      const all = id ? get(id).events : [...db.values()].flatMap((s) => s.events);
      return clone(all.slice().sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit));
    },
    async listDecisions(id) { await delay(60); return (id ? [get(id)] : [...db.values()]).flatMap(decisionsFor); },
    subscribe(projectId, fn) {
      const l = { projectId, fn };
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async listAgents() { await delay(); return clone(AGENTS); },
    async listCatalog() { await delay(); return clone(CATALOG); },
  };
}

const TYPE_NAMES: Record<string, string> = {
  fraud: 'fraud detection', false_decline: 'false declines', friendly_fraud: 'friendly fraud', merchant_risk: 'merchant risk', other: 'model',
};
const SCOPE_WORDS: [RegExp, string][] = [
  [/cross[- ]?border|international/i, 'Cross-border'], [/card[- ]not[- ]present|\bcnp\b|e-?commerce|online/i, 'CNP'],
  [/token/i, 'Token'], [/recurring|subscription/i, 'Recurring payment'], [/\batm\b/i, 'ATM'], [/contactless|tap/i, 'Contactless'],
  [/3-?ds|authenticat/i, 'Authentication'], [/dispute|chargeback/i, 'Dispute'], [/merchant/i, 'Merchant'], [/issuer/i, 'Issuer'],
];
function suggestName(statement: string, problemType: string) {
  const scope = SCOPE_WORDS.find(([re]) => re.test(statement))?.[1];
  const what = TYPE_NAMES[problemType] ?? 'model';
  if (scope && !what.toLowerCase().startsWith(scope.toLowerCase())) return `${scope} ${what}`;
  return what[0].toUpperCase() + what.slice(1);
}
