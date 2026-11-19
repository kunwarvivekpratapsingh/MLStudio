# MLStudio

MLStudio is a platform for building ML models end to end. A data scientist describes a business
problem, and a set of agents takes it through the three MLTC loops on VisaNet data:

| Step | Loop | What happens | What the scientist does |
|---|---|---|---|
| 1 | **Feature engineering** (outer loop) | The Hypothesis agent proposes why the problem happens. Accepted hypotheses are split into sub-hypotheses and turned into features, built on VFP within the scientist's constraints. | Accepts or rejects hypotheses |
| 2 | **Model lab** (middle loop) | An autoresearch-style Researcher runs experiments one after another. Each run has its own hypothesis, training and metrics. It keeps what helps and selects the best model. | Nothing; watches or pauses |
| 3 | **Deployment** (inner loop) | The selected model is packaged, checked and deployed to a lower environment such as UAT, with an inference API. | Approves the deployment, then tests the API with payloads |

Each problem statement is a **project**. A scientist can run several at once (for example, false
declines, friendly fraud and merchant compromise). Runs take hours or days, so the UI is built
for leaving and coming back.

> **Status:** this repository currently contains the **front end** (`ui/`). It runs on a built-in
> mock backend that simulates the agents, so every screen works today. The real backend plugs in
> through the API contract in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

---

## Quick start

Requirements: **Node.js 18 or later** (20 LTS recommended) and npm.

```bash
git clone https://github.com/kunwarvivekpratapsingh/MLStudio.git
cd MLStudio/ui
npm ci            # install exact dependency versions from package-lock.json
npm run dev       # http://localhost:5173
```

The app opens on the Home screen with five sample projects at different stages. A short
"How ML Studio works" guide appears on the first visit; reopen it with the **?** button in the top bar.

### Scripts (run inside `ui/`)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on port 5173 |
| `npm run build` | Type-checks, then builds static files into `ui/dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | TypeScript check only |

### Configuration

Copy `ui/.env.example` to `ui/.env.local` and edit it. All settings are build-time Vite variables.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` uses the in-browser simulation. `http` calls a real backend. |
| `VITE_API_BASE_URL` | none | Base URL of the backend API when `VITE_API_MODE=http`, for example `https://mlstudio-api.example.internal/api` |
| `VITE_ROUTER` | `browser` | Set to `memory` only for single-file previews where the URL cannot change |

---

## Using the app

The navigation is kept small on purpose. Each screen has one job and one obvious next action.

| Screen | Purpose |
|---|---|
| **Home** | Two choices, *Existing projects* or *New project*, plus a **Continue** line that returns you to your last project with its percent complete |
| **Projects** | Every project with a progress ring, current step, time left and next action. Filter by running, needs review, deployed or drafts |
| **New project** | Four steps: problem statement → spec and VisaNet tables → constraints → review and start |
| **Review** | *Needs you*: the checkpoints where agents wait for a decision. *While you were away*: what the agents did since your last visit |
| **Project** | *Overview* shows your next step and the three loop cards. One tab per loop, plus *Files* (agent artifacts), *Activity* and *Spec and constraints* |
| **Platform** | Reference pages: Deployments, VisaNet data catalog, Agents and skills |

Inside a project:

- **Feature engineering:** Hypotheses (accept or reject), Sub-hypotheses, the Feature catalog (hypothesis → sub-hypothesis → feature, with logic and stats) and the VFP build with the constraints it applied.
- **Model lab:** Progress (chart of every run and the best so far), Experiments (table; click a run for its hypothesis, metrics, conclusion and parameters) and Selected model (the Researcher's rationale and alternatives).
- **Deployment:** Test the API (send JSON payloads, see score, decision and top reasons), Status and checks (approval, pipeline and readiness checks) and API details (endpoint, curl, request schema).
- **Files:** every artifact the agents write, versioned, such as `features/hypothesis.md`, `features/sub_hypothesis.md`, `features/feature_catalog.md`, `models/experiment_log.md` and `deploy/inference_api.md`.

The mock backend ticks every 2.6 seconds, so you can watch work move: try accepting the
hypotheses on *Cross-border false declines*, or start a new project and review what the
Hypothesis agent proposes.

---

## Repository layout

```
MLStudio/
├── README.md               ← you are here
├── docs/
│   └── API_CONTRACT.md     ← endpoints, data shapes and event stream the backend must serve
└── ui/                     ← React front end
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── .env.example
    └── src/
        ├── main.tsx            app entry: React Query, toasts, router
        ├── router.tsx          all routes
        ├── api/
        │   ├── types.ts        domain types (the contract in TypeScript)
        │   ├── client.ts       MlStudioApi interface: every operation the UI needs
        │   ├── http.ts         REST + Server-Sent Events implementation
        │   ├── index.ts        picks mock or http from VITE_API_MODE
        │   └── mock/           in-memory backend that simulates the agents
        ├── lib/
        │   ├── queries.ts      React Query hooks and live-update wiring
        │   ├── nextStep.ts     "what should the user do next" for any project
        │   ├── progress.ts     overall percent, elapsed time, time left, visit memory
        │   └── format.ts       formatters and loop/status metadata
        ├── components/         app shell, UI kit, guide, charts, progress ring, event list
        ├── pages/              Home, Projects, New project, Review, Platform and reference pages
        │   └── project/        Overview, Feature engineering, Model lab, Deployment, Files, Activity, Spec
        └── styles/global.css   design tokens (light and dark) and component styles
```

### How data flows

```
pages and components
      │  React Query hooks (lib/queries.ts)
      ▼
MlStudioApi interface (api/client.ts)
      ├── mock  (api/mock)   default, runs in the browser
      └── http  (api/http.ts) REST calls + SSE stream to the real backend
```

Pages never call `fetch` directly. Live updates arrive as agent events (SSE in http mode).
The UI treats each event as a signal and refetches the affected queries, so the backend does not
need to send full objects over the stream.

---

## Connecting the backend

1. Implement the endpoints in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). The TypeScript shapes in
   `ui/src/api/types.ts` are the source of truth for request and response bodies.
2. Serve the event streams `/events/stream` and `/projects/:id/events/stream` as Server-Sent Events.
   Each `data:` line is one JSON `AgentEvent`.
3. Run the UI against it:

   ```bash
   cd ui
   VITE_API_MODE=http VITE_API_BASE_URL=https://<api-host>/api npm run dev
   ```

Notes for the backend:

- Requests send cookies (`credentials: 'include'`), so session or SSO cookie auth works without UI changes. Allow the UI origin in CORS with credentials.
- Long runs: each loop has `progress` (0 to 1), `startedAt`, `finishedAt` and an optional `etaAt`. Send `etaAt` when you can estimate it; otherwise the UI estimates time left from progress.
- `POST /projects/:id/deployment/invoke` should proxy to the model endpoint, so the browser never holds model credentials. Return `400` or `422` with `{ "error": "...", "field": "..." }` for invalid payloads; the test console shows it inline.
- A suggested build order is at the end of the API contract: projects and events first, then Loop 1, Loop 2 and Loop 3.

---

## Deploying the UI

`npm run build` produces static files in `ui/dist/`. Host them on any static server or CDN.
Because routing uses the browser history API, configure the server to return `index.html` for
unknown paths (SPA fallback). Set `VITE_API_MODE=http` and `VITE_API_BASE_URL` at build time.

---

## Design notes

- **Theme:** a Visa-inspired palette defined as CSS variables at the top of `ui/src/styles/global.css`: deep navy for chrome, Visa blue for actions, gold for anything that needs the user. Light and dark modes follow the OS setting. No Visa logos or trademarks are included.
- **Loop colours:** features blue, models teal, deployment violet. Gold always means "waiting on you".
- **Accessibility:** keyboard focus rings, labelled controls, reduced-motion support, and layouts that work down to phone width.

## Tech stack

React 18, TypeScript (strict), Vite 5, React Router 6, TanStack Query 5, react-markdown with GFM.

## Roadmap

- [x] End-to-end UI for all three loops, with a mock backend
- [ ] Backend services implementing `docs/API_CONTRACT.md`
- [ ] Wire agents to Claude Code skills and VFP
- [ ] Authentication and per-user project ownership
