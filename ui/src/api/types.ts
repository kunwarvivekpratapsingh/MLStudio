/**
 * ML Studio domain model.
 *
 * This file is the contract between the UI and the backend. Every screen reads
 * these shapes through `MlStudioApi` (see ./client.ts). The mock backend in
 * ./mock implements the same interface so the backend team can swap it out
 * without touching any page.
 */

export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export type ProblemType = 'fraud' | 'false_decline' | 'friendly_fraud' | 'merchant_risk' | 'other';

export type LoopId = 'features' | 'models' | 'deploy';

export type LoopStatus = 'not_started' | 'running' | 'waiting' | 'paused' | 'done' | 'failed';

export type ProjectStatus = 'draft' | 'running' | 'needs_review' | 'paused' | 'deployed' | 'failed';

export interface LoopState {
  status: LoopStatus;
  /** 0..1 */
  progress: number;
  /** One line describing what the loop is doing right now. */
  summary: string;
  startedAt?: ISODate;
  finishedAt?: ISODate;
  /** Backend estimate of when this loop finishes. The UI extrapolates from progress when it is missing. */
  etaAt?: ISODate;
}

export interface ProblemSpec {
  objective: string;
  label: string;
  unitOfScoring: string;
  population: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  timeSplit: { train: string; validate: string; outOfTime: string };
}

export interface Constraints {
  /** VisaNet tables the agents may read. */
  tables: string[];
  dataWindow: { from: string; to: string };
  /** Feature aggregation windows the agents may use, e.g. "1h", "7d". */
  featureWindows: string[];
  /** Columns agents must never use (e.g. protected or unstable fields). */
  excludedColumns: string[];
  maxFeatures: number;
  maxLatencyMs: number;
  computeBudgetGpuHours: number;
  maxExperiments: number;
  /** Stop the model loop after this many runs without improvement. */
  earlyStopAfter: number;
  requireExplainability: boolean;
  deployTarget: 'dev' | 'uat';
  /** If false, the Deployer deploys the best model without waiting for a person. */
  requireApprovalBeforeDeploy: boolean;
}

export interface Headline {
  metricName: string;
  value: number;
  baseline: number;
  unit: '%' | '';
}

export interface ProjectSummary {
  id: string;
  name: string;
  problemType: ProblemType;
  owner: string;
  status: ProjectStatus;
  currentLoop: LoopId | null;
  loops: Record<LoopId, LoopState>;
  headline?: Headline;
  pendingDecisions: number;
  lastActivity?: { ts: ISODate; agent: AgentId; message: string };
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Project extends ProjectSummary {
  statement: string;
  spec: ProblemSpec;
  constraints: Constraints;
}

export interface NewProjectInput {
  name: string;
  problemType: ProblemType;
  statement: string;
  spec: ProblemSpec;
  constraints: Constraints;
  /** Start loop 1 immediately after creation. */
  start: boolean;
}

/* ------------------------------------------------------------------ */
/* Loop 1: feature engineering                                         */
/* ------------------------------------------------------------------ */

export type ReviewStatus = 'proposed' | 'accepted' | 'rejected';

export interface Hypothesis {
  id: string; // "H1"
  title: string;
  rationale: string;
  /** Evidence the agent sampled from data, markdown allowed. */
  evidence: string;
  tables: string[];
  expectedLift: 1 | 2 | 3 | 4 | 5;
  status: ReviewStatus;
  reviewedBy?: string;
}

export interface SubHypothesis {
  id: string; // "H1.2"
  hypothesisId: string;
  title: string;
  /** The measurable signal that would support the sub-hypothesis. */
  signal: string;
  status: ReviewStatus;
}

export type FeatureBuildStatus = 'spec' | 'queued' | 'building' | 'validating' | 'ready' | 'failed' | 'excluded';

export interface FeatureStats {
  informationValue: number;
  coveragePct: number;
  psi: number;
  leakage: 'pass' | 'fixed' | 'fail';
  leakageNote?: string;
}

export interface Feature {
  id: string;
  name: string;
  hypothesisId: string;
  subHypothesisId: string;
  description: string;
  entity: 'card' | 'merchant' | 'card_merchant' | 'transaction' | 'acquirer';
  window: string;
  dtype: 'int' | 'float' | 'bool' | 'category';
  tables: string[];
  /** SQL / PySpark the Feature engineer generated. */
  logic: string;
  buildStatus: FeatureBuildStatus;
  excludedReason?: string;
  vfpJobId?: string;
  stats?: FeatureStats;
}

export interface VfpJob {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  featureIds: string[];
  submittedAt: ISODate;
  finishedAt?: ISODate;
  partitionsDone: number;
  partitionsTotal: number;
  rowsProcessed: number;
  /** Scientist constraints the VFP builder enforced on this job. */
  constraintsApplied: string[];
}

/* ------------------------------------------------------------------ */
/* Loop 2: model training and improvement                              */
/* ------------------------------------------------------------------ */

export type ExperimentStatus = 'queued' | 'training' | 'completed' | 'failed';

export interface ExperimentMetrics {
  /** Value of the project's primary metric, in percent. */
  primary: number;
  aucPr: number;
  precisionAtThreshold: number;
  latencyP99Ms: number;
}

export interface Experiment {
  id: string;
  index: number;
  /** What the Researcher believed and why it ran this experiment. */
  hypothesis: string;
  /** The single change from the parent run. */
  change: string;
  parentId?: string;
  modelFamily: string;
  params: Record<string, string | number | boolean>;
  featureCount: number;
  status: ExperimentStatus;
  metrics?: ExperimentMetrics;
  /** Primary metric minus the best value before this run. */
  delta?: number;
  outcome: 'kept' | 'discarded' | 'pending';
  /** What the Researcher concluded after reading the result. */
  conclusion?: string;
  gpuHours: number;
  startedAt?: ISODate;
  finishedAt?: ISODate;
}

export interface ModelSelection {
  experimentId: string;
  selectedBy: AgentId | string;
  selectedAt: ISODate;
  rationale: string;
  alternatives: { experimentId: string; reason: string }[];
}

export interface ModelLoopStats {
  gpuHoursUsed: number;
  gpuHoursBudget: number;
  runsWithoutImprovement: number;
  earlyStopAfter: number;
  maxExperiments: number;
  stopReason?: string;
}

/* ------------------------------------------------------------------ */
/* Loop 3: deployment and inference                                    */
/* ------------------------------------------------------------------ */

export type DeploymentStatus = 'awaiting_approval' | 'packaging' | 'checking' | 'deploying' | 'live' | 'failed';

export interface ReadinessCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  detail: string;
}

export interface FieldSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp';
  required: boolean;
  description: string;
  example: string | number | boolean;
}

export interface Deployment {
  id: string;
  projectId: string;
  projectName: string;
  experimentId: string;
  modelVersion: string;
  environment: 'dev' | 'uat';
  status: DeploymentStatus;
  endpoint?: string;
  createdAt: ISODate;
  liveAt?: ISODate;
  checks: ReadinessCheck[];
  inputSchema: FieldSpec[];
  samplePayload: Record<string, unknown>;
  threshold: number;
  traffic?: { requestsLastHour: number; p50Ms: number; p99Ms: number; errorRatePct: number };
}

export interface InferenceResponse {
  requestId: string;
  modelVersion: string;
  score: number;
  threshold: number;
  decision: string;
  reasons: { feature: string; contribution: number; text: string }[];
  latencyMs: number;
}

export interface InferenceError {
  error: string;
  field?: string;
}

/* ------------------------------------------------------------------ */
/* Artifacts, agents, events, decisions                                */
/* ------------------------------------------------------------------ */

export type AgentId =
  | 'orchestrator'
  | 'hypothesis'
  | 'sub_hypothesis'
  | 'feature_engineer'
  | 'vfp_builder'
  | 'validator'
  | 'researcher'
  | 'trainer'
  | 'deployer';

export interface AgentInfo {
  id: AgentId;
  name: string;
  loop: LoopId | 'mission';
  role: string;
  skills: string[];
  produces: string[];
}

export type ArtifactKind = 'markdown' | 'yaml' | 'json' | 'csv' | 'sql';

export interface ArtifactMeta {
  path: string; // "features/hypothesis.md"
  loop: LoopId | 'project';
  kind: ArtifactKind;
  producedBy: AgentId;
  version: number;
  updatedAt: ISODate;
  sizeBytes: number;
  description: string;
}

export interface Artifact extends ArtifactMeta {
  content: string;
}

export type EventKind = 'info' | 'artifact' | 'milestone' | 'decision' | 'warning' | 'error';

export interface AgentEvent {
  id: string;
  projectId: string;
  projectName: string;
  ts: ISODate;
  agent: AgentId;
  loop: LoopId | 'project';
  kind: EventKind;
  message: string;
  tool?: string;
  artifactPath?: string;
}

export interface Decision {
  id: string;
  projectId: string;
  projectName: string;
  loop: LoopId;
  title: string;
  detail: string;
  /** Where in the UI the person makes the decision. */
  link: string;
  createdAt: ISODate;
}

export interface CatalogTable {
  name: string;
  description: string;
  rows: string;
  freshness: string;
  joinKeys: string[];
  columns: { name: string; type: string; description: string }[];
}
