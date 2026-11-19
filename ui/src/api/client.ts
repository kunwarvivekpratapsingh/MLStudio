import type {
  AgentEvent,
  AgentInfo,
  Artifact,
  ArtifactMeta,
  CatalogTable,
  Constraints,
  Decision,
  Deployment,
  Experiment,
  Feature,
  Hypothesis,
  InferenceError,
  InferenceResponse,
  LoopId,
  ModelLoopStats,
  ModelSelection,
  NewProjectInput,
  ProblemSpec,
  ProblemType,
  Project,
  ProjectSummary,
  ReviewStatus,
  SubHypothesis,
  VfpJob,
} from './types';

/**
 * The one interface every screen uses. A backend implements these calls;
 * see docs/API_CONTRACT.md for the matching REST endpoints.
 */
export interface MlStudioApi {
  // Workspace
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<Project>;
  /** Orchestrator turns a plain-language statement into a draft spec and constraints. */
  draftSpec(input: { statement: string; problemType: ProblemType }): Promise<{ name: string; spec: ProblemSpec; constraints: Constraints }>;
  createProject(input: NewProjectInput): Promise<Project>;
  updateConstraints(projectId: string, constraints: Constraints): Promise<Project>;
  setLoopPaused(projectId: string, loop: LoopId, paused: boolean): Promise<Project>;

  // Loop 1
  listHypotheses(projectId: string): Promise<Hypothesis[]>;
  listSubHypotheses(projectId: string): Promise<SubHypothesis[]>;
  reviewHypothesis(projectId: string, hypothesisId: string, status: ReviewStatus): Promise<Hypothesis>;
  listFeatures(projectId: string): Promise<Feature[]>;
  listVfpJobs(projectId: string): Promise<VfpJob[]>;

  // Loop 2
  listExperiments(projectId: string): Promise<Experiment[]>;
  getModelLoopStats(projectId: string): Promise<ModelLoopStats>;
  getModelSelection(projectId: string): Promise<ModelSelection | null>;

  // Loop 3
  listDeployments(): Promise<Deployment[]>;
  getDeployment(projectId: string): Promise<Deployment | null>;
  approveDeployment(projectId: string): Promise<Deployment>;
  invoke(projectId: string, payload: unknown): Promise<InferenceResponse | InferenceError>;

  // Artifacts and activity
  listArtifacts(projectId: string): Promise<ArtifactMeta[]>;
  getArtifact(projectId: string, path: string): Promise<Artifact>;
  listEvents(projectId?: string, limit?: number): Promise<AgentEvent[]>;
  listDecisions(projectId?: string): Promise<Decision[]>;
  /** Live stream of agent events. Pass null for all projects. Returns an unsubscribe function. */
  subscribe(projectId: string | null, onEvent: (e: AgentEvent) => void): () => void;

  // Reference
  listAgents(): Promise<AgentInfo[]>;
  listCatalog(): Promise<CatalogTable[]>;
}
