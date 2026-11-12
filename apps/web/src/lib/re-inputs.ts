// Client for the dev server's reverse-engineering endpoints
// (apps/web/vite-plugin-reverse-engineering.ts): upload inputs, start a run,
// follow its progress.
import type { CompanyId } from '../data/index.js';

/** Each engagement's inputs and generated BRD live under this project slug. */
export const PROJECT_FOR_ENGAGEMENT: Record<CompanyId, string> = {
  fintech: 'indian-banking-system',
  aurora: 'aurora-commerce',
};

export interface UploadedFile {
  kind: string;
  module: string;
  name: string;
  size: number;
}

export interface InputsListing {
  files: UploadedFile[];
  repoUrl: string;
}

export interface RunStatus {
  state: 'idle' | 'running' | 'done' | 'failed' | 'interrupted';
  step?: number;
  totalSteps?: number;
  stepLabel?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  log?: string[];
  result?: {
    pdf: boolean;
    traced: number;
    counts: Record<string, number>;
    skipped: { path: string; reason: string }[];
  };
}

async function call<T>(
  method: string,
  path: string,
  query: Record<string, string>,
  body?: BodyInit,
): Promise<T> {
  const res = await fetch(`/api/re/${path}?${new URLSearchParams(query).toString()}`, {
    method,
    ...(body !== undefined ? { body } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const listInputs = (project: string) => call<InputsListing>('GET', 'inputs', { project });

export const uploadInput = (project: string, kind: string, module: string, file: File) =>
  call<InputsListing>('PUT', 'inputs', { project, kind, module, name: file.name }, file);

export const deleteInput = (project: string, kind: string, module: string, name: string) =>
  call<InputsListing>('DELETE', 'inputs', { project, kind, module, name });

export const setRepoUrl = (project: string, url: string) =>
  call<InputsListing>('PUT', 'repo', { project }, JSON.stringify({ url }));

export const startGeneration = (project: string) =>
  call<{ started: boolean }>('POST', 'generate', { project });

export const getRunStatus = (project: string) => call<RunStatus>('GET', 'status', { project });
