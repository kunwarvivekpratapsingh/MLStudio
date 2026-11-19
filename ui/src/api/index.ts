import type { MlStudioApi } from './client';
import { createHttpApi } from './http';
import { createMockApi } from './mock';

const mode = import.meta.env.VITE_API_MODE ?? 'mock';

/** Single API instance. Set VITE_API_MODE=http to use the real backend. */
export const api: MlStudioApi =
  mode === 'http' ? createHttpApi(import.meta.env.VITE_API_BASE_URL ?? '/api') : createMockApi();

export * from './types';
