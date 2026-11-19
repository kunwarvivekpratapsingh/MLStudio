# ML Studio API contract

This is the backend contract the UI is built against. The TypeScript source of truth is
`ui/src/api/types.ts` (shapes) and `ui/src/api/client.ts` (operations). `ui/src/api/http.ts` is the
REST client that calls the endpoints below, and `ui/src/api/mock/` is an in-memory backend that
implements the same interface so the UI runs without a server.

## Switching from the mock to a real backend

```bash
cd ui
VITE_API_MODE=http VITE_API_BASE_URL=https://mlstudio-api.example.internal/api npm run dev
```

- All requests send cookies (`credentials: 'include'`), so auth is expected to be SSO session based.
- Bodies are JSON. Timestamps are ISO 8601 strings in UTC.
- Any non-2xx response is shown as an error in the UI with the response text.

## Core model

| Concept | What it is |
|---|---|
| Project | One problem statement. Owns a spec, constraints and three loops. |
| Loop | `features` (Loop 1), `models` (Loop 2), `deploy` (Loop 3). Each has a status, progress (0–1), summary line, `startedAt`, `finishedAt` and an optional `etaAt`. Runs take hours or days, so the UI shows overall percent, elapsed time and time left from these fields. Send `etaAt` when the backend can estimate it; otherwise the UI extrapolates from progress. |
| Hypothesis → Sub-hypothesis → Feature | The lineage that the feature catalog shows. Every feature carries `hypothesisId` and `subHypothesisId` plus its SQL/VFP logic. |
| VFP job | A feature build on VFP. Lists the scientist constraints it applied. |
| Experiment | One model-loop run: hypothesis, change, params, metrics, delta vs best, outcome (`kept` or `discarded`), conclusion. |
| Model selection | The Researcher agent's chosen experiment, rationale and alternatives. |
| Deployment | A model in a lower environment with readiness checks, endpoint, request schema and sample payload. |
| Artifact | A file an agent wrote, such as `features/hypothesis.md`. Versioned. |
| Event | One line of agent activity. Streamed over SSE. |
| Decision | Something waiting on a person: hypothesis review or deployment approval. |

## Endpoints

### Projects

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/projects` | | `ProjectSummary[]` |
| GET | `/projects/:id` | | `Project` |
| POST | `/projects/draft-spec` | `{ statement, problemType }` | `{ name, spec, constraints }` suggested by the orchestrator agent |
| POST | `/projects` | `NewProjectInput` (`start: true` starts Loop 1 right away) | `Project` |
| PUT | `/projects/:id/constraints` | `Constraints` | `Project` |
| POST | `/projects/:id/loops/:loop/pause` | | `Project` |
| POST | `/projects/:id/loops/:loop/resume` | | `Project` (also used to start a draft) |

### Loop 1: features

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/projects/:id/hypotheses` | | `Hypothesis[]` |
| PATCH | `/projects/:id/hypotheses/:hid` | `{ status: 'accepted' \| 'rejected' \| 'proposed' }` | `Hypothesis` |
| GET | `/projects/:id/sub-hypotheses` | | `SubHypothesis[]` |
| GET | `/projects/:id/features` | | `Feature[]` |
| GET | `/projects/:id/vfp-jobs` | | `VfpJob[]` |

Expected behaviour: once every proposed hypothesis is reviewed, the backend runs the
sub-hypothesis agent, the feature engineer and the VFP build, using only accepted hypotheses.

### Loop 2: models

| Method | Path | Returns |
|---|---|---|
| GET | `/projects/:id/experiments` | `Experiment[]` in run order |
| GET | `/projects/:id/model-loop` | `ModelLoopStats` (budget used, runs since last gain, stop reason) |
| GET | `/projects/:id/model-selection` | `ModelSelection` or `null` |

The loop stops on `earlyStopAfter` runs without gain, `maxExperiments`, or the GPU budget,
whichever comes first. Then the Researcher writes the selection.

### Loop 3: deployment and inference

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/deployments` | | `Deployment[]` across projects |
| GET | `/projects/:id/deployment` | | `Deployment` or `null` |
| POST | `/projects/:id/deployment/approve` | | `Deployment` |
| POST | `/projects/:id/deployment/invoke` | payload matching `deployment.inputSchema` | `InferenceResponse`, or `InferenceError` with status 400/422 |

Deployment statuses: `awaiting_approval → packaging → checking → deploying → live` (or `failed`).
The test console in the UI calls `invoke`. In production this should proxy to the model
endpoint (`deployment.endpoint`) so the browser never holds model credentials.

### Artifacts, activity, decisions

| Method | Path | Returns |
|---|---|---|
| GET | `/projects/:id/artifacts` | `ArtifactMeta[]` |
| GET | `/projects/:id/artifacts/<path>` | `Artifact` (meta plus `content` as text) |
| GET | `/events?limit=` | `AgentEvent[]` across projects, newest first |
| GET | `/projects/:id/events?limit=` | `AgentEvent[]` for a project |
| GET | `/decisions` | `Decision[]` across projects |
| GET | `/projects/:id/decisions` | `Decision[]` for a project |

Artifact paths the UI knows about:

```
project/problem_statement.md     project/constraints.yaml
features/hypothesis.md           features/sub_hypothesis.md
features/feature_catalog.md      features/vfp_build_spec.yaml
features/validation_report.md
models/experiment_log.md         models/leaderboard.csv
models/model_selection.md
deploy/deployment.yaml           deploy/readiness_report.md
deploy/inference_api.md
```

### Live updates (SSE)

| Path | Stream |
|---|---|
| `/events/stream` | every `AgentEvent` for the user's projects |
| `/projects/:id/events/stream` | one project |

Each SSE `data:` line is one JSON `AgentEvent`. The UI does not apply events to its cache. It
treats them as a signal and refetches the affected queries (throttled to 250 ms), so events
only need `projectId`, `loop`, `kind` and `message`. Set `artifactPath` when an agent writes a
file, so the activity feed can link to it.

### Reference data

| Method | Path | Returns |
|---|---|---|
| GET | `/agents` | `AgentInfo[]` (role, skills, artifacts it writes) |
| GET | `/catalog/tables` | `CatalogTable[]` (VisaNet tables and columns) |

## Suggested backend build order

1. `GET /projects`, `GET /projects/:id`, `/events/stream`, so the workspace shows real projects.
2. Loop 1 endpoints plus artifacts, wired to the Claude Code skills and VFP.
3. Loop 2 endpoints, wired to the autoresearch training loop.
4. Loop 3 endpoints and the `invoke` proxy.
