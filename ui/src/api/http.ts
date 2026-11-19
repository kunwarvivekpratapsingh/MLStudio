import type { MlStudioApi } from './client';
import type { AgentEvent } from './types';

/**
 * REST implementation of MlStudioApi. Endpoints are documented in
 * ../docs/API_CONTRACT.md (repo root). Enable with VITE_API_MODE=http and VITE_API_BASE_URL.
 */
export function createHttpApi(baseUrl: string): MlStudioApi {
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed with ${res.status}${text ? `: ${text}` : ''}`);
    }
    return (await res.json()) as T;
  }
  const p = (id: string) => `/projects/${encodeURIComponent(id)}`;

  return {
    listProjects: () => req('GET', '/projects'),
    getProject: (id) => req('GET', p(id)),
    draftSpec: (input) => req('POST', '/projects/draft-spec', input),
    createProject: (input) => req('POST', '/projects', input),
    updateConstraints: (id, c) => req('PUT', `${p(id)}/constraints`, c),
    setLoopPaused: (id, loop, paused) => req('POST', `${p(id)}/loops/${loop}/${paused ? 'pause' : 'resume'}`),

    listHypotheses: (id) => req('GET', `${p(id)}/hypotheses`),
    listSubHypotheses: (id) => req('GET', `${p(id)}/sub-hypotheses`),
    reviewHypothesis: (id, hid, status) => req('PATCH', `${p(id)}/hypotheses/${hid}`, { status }),
    listFeatures: (id) => req('GET', `${p(id)}/features`),
    listVfpJobs: (id) => req('GET', `${p(id)}/vfp-jobs`),

    listExperiments: (id) => req('GET', `${p(id)}/experiments`),
    getModelLoopStats: (id) => req('GET', `${p(id)}/model-loop`),
    getModelSelection: (id) => req('GET', `${p(id)}/model-selection`),

    listDeployments: () => req('GET', '/deployments'),
    getDeployment: (id) => req('GET', `${p(id)}/deployment`),
    approveDeployment: (id) => req('POST', `${p(id)}/deployment/approve`),
    invoke: async (id, payload) => {
      // Validation failures come back as 400/422 with an InferenceError body, which the console shows inline.
      const res = await fetch(`${baseUrl}${p(id)}/deployment/invoke`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'include',
      });
      if (res.ok || res.status === 400 || res.status === 422) return res.json();
      throw new Error(`POST invoke failed with ${res.status}`);
    },

    listArtifacts: (id) => req('GET', `${p(id)}/artifacts`),
    getArtifact: (id, path) => req('GET', `${p(id)}/artifacts/${path.split('/').map(encodeURIComponent).join('/')}`),
    listEvents: (id, limit = 100) => req('GET', id ? `${p(id)}/events?limit=${limit}` : `/events?limit=${limit}`),
    listDecisions: (id) => req('GET', id ? `${p(id)}/decisions` : '/decisions'),
    subscribe: (id, onEvent) => {
      const es = new EventSource(`${baseUrl}${id ? `${p(id)}/events/stream` : '/events/stream'}`, { withCredentials: true });
      es.onmessage = (m) => onEvent(JSON.parse(m.data) as AgentEvent);
      return () => es.close();
    },

    listAgents: () => req('GET', '/agents'),
    listCatalog: () => req('GET', '/catalog/tables'),
  };
}
