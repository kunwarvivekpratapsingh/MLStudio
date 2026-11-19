import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { Constraints, LoopId, NewProjectInput, ReviewStatus } from '@/api';

export const qk = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  sub: (id: string, what: string) => ['project', id, what] as const,
  global: (what: string) => ['global', what] as const,
};

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: api.listProjects });
export const useProject = (id: string) => useQuery({ queryKey: qk.project(id), queryFn: () => api.getProject(id) });
export const useHypotheses = (id: string) => useQuery({ queryKey: qk.sub(id, 'hypotheses'), queryFn: () => api.listHypotheses(id) });
export const useSubHypotheses = (id: string) => useQuery({ queryKey: qk.sub(id, 'subs'), queryFn: () => api.listSubHypotheses(id) });
export const useFeatures = (id: string) => useQuery({ queryKey: qk.sub(id, 'features'), queryFn: () => api.listFeatures(id) });
export const useVfpJobs = (id: string) => useQuery({ queryKey: qk.sub(id, 'vfp'), queryFn: () => api.listVfpJobs(id) });
export const useExperiments = (id: string) => useQuery({ queryKey: qk.sub(id, 'experiments'), queryFn: () => api.listExperiments(id) });
export const useModelStats = (id: string) => useQuery({ queryKey: qk.sub(id, 'model-stats'), queryFn: () => api.getModelLoopStats(id) });
export const useSelection = (id: string) => useQuery({ queryKey: qk.sub(id, 'selection'), queryFn: () => api.getModelSelection(id) });
export const useDeployment = (id: string) => useQuery({ queryKey: qk.sub(id, 'deployment'), queryFn: () => api.getDeployment(id) });
export const useArtifacts = (id: string) => useQuery({ queryKey: qk.sub(id, 'artifacts'), queryFn: () => api.listArtifacts(id) });
export const useArtifact = (id: string, path: string | null) =>
  useQuery({ queryKey: qk.sub(id, `artifact:${path}`), queryFn: () => api.getArtifact(id, path!), enabled: !!path });
export const useEvents = (id?: string, limit = 100) =>
  useQuery({ queryKey: id ? qk.sub(id, `events:${limit}`) : qk.global(`events:${limit}`), queryFn: () => api.listEvents(id, limit) });
export const useDecisions = (id?: string) =>
  useQuery({ queryKey: id ? qk.sub(id, 'decisions') : qk.global('decisions'), queryFn: () => api.listDecisions(id) });
export const useDeployments = () => useQuery({ queryKey: qk.global('deployments'), queryFn: api.listDeployments });
export const useAgents = () => useQuery({ queryKey: qk.global('agents'), queryFn: api.listAgents, staleTime: Infinity });
export const useCatalog = () => useQuery({ queryKey: qk.global('catalog'), queryFn: api.listCatalog, staleTime: Infinity });

/** Subscribes to agent events and refreshes affected data as they arrive. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const touched = new Set<string>();
    const unsub = api.subscribe(null, (e) => {
      touched.add(e.projectId);
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: qk.projects });
        qc.invalidateQueries({ queryKey: ['global'], predicate: (q) => q.queryKey[1] !== 'agents' && q.queryKey[1] !== 'catalog' });
        touched.forEach((id) => qc.invalidateQueries({ queryKey: qk.project(id) }));
        touched.clear();
      }, 250);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [qc]);
}

export function useReviewHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: ReviewStatus }) => api.reviewHypothesis(projectId, v.id, v.status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: ['global'] }); qc.invalidateQueries({ queryKey: qk.projects }); },
  });
}
export function useSetLoopPaused(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { loop: LoopId; paused: boolean }) => api.setLoopPaused(projectId, v.loop, v.paused),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: qk.projects }); },
  });
}
export function useApproveDeployment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.approveDeployment(projectId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.project(projectId) }); qc.invalidateQueries({ queryKey: ['global'] }); qc.invalidateQueries({ queryKey: qk.projects }); },
  });
}
export function useUpdateConstraints(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Constraints) => api.updateConstraints(projectId, c),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.project(projectId) }),
  });
}
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProjectInput) => api.createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}
