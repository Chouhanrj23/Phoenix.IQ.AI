/**
 * P8 -- FR-IF-01: register sources and trigger analysis runs over the API;
 * FR-IF-03/05: serve each run's real outputs (OKF, artifacts, export,
 * changelog, gaps, knowledge risk, evaluation).
 *
 * Runs execute the REAL pipeline (`@phoenix-ai/orchestration`) in this
 * process, one at a time, in submission order: an analysis is CPU- and
 * memory-heavy, and two at once would only make both slower. A run is
 * accepted immediately (202) and its status polled.
 *
 * Everything a run produces is written under the workspace directory
 * (`PHOENIX_WORKSPACE_DIR`), so outputs and version history survive a
 * restart:
 *
 *   sources.json                      registered sources
 *   runs/<runId>/run.json             status, stages, summary
 *   runs/<runId>/knowledge.okf.yaml   the OKF document
 *   runs/<runId>/outputs.json         changelog, gaps, knowledge risk, evaluation
 *   versions/<systemId>/...           the immutable graph versions (FR-KG-05)
 *
 * Tenancy (FR-ORC-04): every source and run belongs to one `systemId`;
 * listings are always filtered by it.
 *
 * Security: a source's locator is a remote git URL (https:// or ssh://).
 * A local `file://` path would let an API caller make the server read its
 * own filesystem, so it is refused unless the operator sets
 * `PHOENIX_ALLOW_LOCAL_SOURCES=true` (development and tests). Credentials
 * embedded in a URL are refused outright -- they would be stored in
 * sources.json and echoed back by GET /api/sources.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  createFileGraphVersionStore,
  toDriftRun,
  type Changelog,
  type GraphVersionStore,
} from '@phoenix-ai/drift-detection';
import { verifyRoundTrip, type RoundTripReport } from '@phoenix-ai/evaluation-harness';
import {
  createJavaParseCache,
  type JavaParseCache,
  type KnowledgeRiskFinding,
} from '@phoenix-ai/extraction-engine';
import type { GapReport } from '@phoenix-ai/gap-analysis';
import { createGitRepositoryConnector } from '@phoenix-ai/ingestion-connectors';
import { exportOkfPackage, type ExportPackage } from '@phoenix-ai/okf-renderers';
import { PipelineStageError, runPipeline, type StageReport } from '@phoenix-ai/orchestration';
import { getEnv, logger, type DriftRun, type GapItem } from '@phoenix-ai/shared';
import { ApiError } from '../errors.js';

export interface RegisteredSource {
  readonly id: string;
  readonly systemId: string;
  readonly label: string;
  readonly locator: string;
  readonly branch?: string;
  readonly registeredAt: string;
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface RunRecord {
  readonly id: string;
  readonly systemId: string;
  readonly sourceId: string;
  readonly status: RunStatus;
  readonly submittedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly versionId?: string;
  readonly stages?: readonly StageReport[];
  /** When failed: the stage that stopped the run and why. */
  readonly failure?: { readonly stage?: string; readonly errors: readonly string[] };
  readonly summary?: {
    readonly objects: number;
    readonly relationships: number;
    readonly changes: number;
    readonly gaps: number;
    readonly coverageScore: number;
  };
}

interface RunOutputs {
  readonly changelog: Changelog;
  readonly gaps: GapReport;
  readonly knowledgeRisk: readonly KnowledgeRiskFinding[];
  readonly evaluation: RoundTripReport;
}

const ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export interface RunServiceOptions {
  readonly workspaceDir: string;
  readonly defaultSystemId: string;
  readonly allowLocalSources: boolean;
  /** Injected clock, for tests. Runs record real event times. */
  readonly now?: () => Date;
}

export function runServiceOptionsFromEnv(): RunServiceOptions {
  return {
    workspaceDir: resolve(getEnv('PHOENIX_WORKSPACE_DIR', '.phoenix-workspace')),
    defaultSystemId: getEnv('PHOENIX_SYSTEM_ID', 'aurora-commerce'),
    allowLocalSources: getEnv('PHOENIX_ALLOW_LOCAL_SOURCES', 'false') === 'true',
  };
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ApiError(400, `"${name}" must be 1-100 characters of [A-Za-z0-9._-]`);
  }
  return value;
}

/** A git branch name: path-like, but never an option (`-x`) or a traversal (`..`). */
function requireBranch(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,200}$/.test(value) ||
    value.startsWith('-') ||
    value.includes('..')
  ) {
    throw new ApiError(400, '"branch" must be a plain git branch name');
  }
  return value;
}

export class RunService {
  private readonly options: RunServiceOptions;
  private readonly versions: GraphVersionStore;
  private readonly parseCaches = new Map<string, JavaParseCache>();
  private queue: Promise<void> = Promise.resolve();
  private readonly pending = new Set<Promise<void>>();

  constructor(options: RunServiceOptions) {
    this.options = options;
    this.versions = createFileGraphVersionStore(join(options.workspaceDir, 'versions'));
  }

  get defaultSystemId(): string {
    return this.options.defaultSystemId;
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private path(...segments: string[]): string {
    return join(this.options.workspaceDir, ...segments);
  }

  private async readJson<T>(path: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporary, path);
  }

  // --- Sources ---------------------------------------------------------------------------------

  async listSources(systemId: string): Promise<RegisteredSource[]> {
    const all = (await this.readJson<RegisteredSource[]>(this.path('sources.json'))) ?? [];
    return all.filter((s) => s.systemId === systemId);
  }

  async registerSource(body: unknown): Promise<RegisteredSource> {
    if (body === null || typeof body !== 'object')
      throw new ApiError(400, 'request body must be a JSON object');
    const raw = body as Record<string, unknown>;
    const systemId =
      raw.systemId === undefined
        ? this.options.defaultSystemId
        : requireId(raw.systemId, 'systemId');
    const id = requireId(raw.id, 'id');
    if (typeof raw.locator !== 'string' || raw.locator.length === 0) {
      throw new ApiError(400, '"locator" must be a git URL (https:// or ssh://)');
    }
    const locator = raw.locator;
    let url: URL;
    try {
      url = new URL(locator);
    } catch {
      throw new ApiError(400, '"locator" must be a git URL (https:// or ssh://)');
    }
    if (url.username !== '' || url.password !== '') {
      throw new ApiError(
        400,
        '"locator" must not embed credentials; configure git credentials on the server instead',
      );
    }
    if (url.protocol === 'file:') {
      if (!this.options.allowLocalSources) {
        throw new ApiError(
          400,
          'local file:// sources are disabled on this server (set PHOENIX_ALLOW_LOCAL_SOURCES=true to allow them)',
        );
      }
    } else if (url.protocol !== 'https:' && url.protocol !== 'ssh:') {
      throw new ApiError(400, '"locator" must be a git URL (https:// or ssh://)');
    }
    const branch = raw.branch === undefined ? undefined : requireBranch(raw.branch);
    const label =
      typeof raw.label === 'string' && raw.label.trim() !== ''
        ? raw.label.trim().slice(0, 200)
        : id;

    const all = (await this.readJson<RegisteredSource[]>(this.path('sources.json'))) ?? [];
    if (all.some((s) => s.systemId === systemId && s.id === id)) {
      throw new ApiError(409, `source "${id}" is already registered for system "${systemId}"`);
    }
    const source: RegisteredSource = {
      id,
      systemId,
      label,
      locator,
      ...(branch === undefined ? {} : { branch }),
      registeredAt: this.now(),
    };
    await this.writeJson(this.path('sources.json'), [...all, source]);
    return source;
  }

  // --- Runs ------------------------------------------------------------------------------------

  async listRuns(systemId: string): Promise<RunRecord[]> {
    let entries: string[];
    try {
      entries = await readdir(this.path('runs'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const runs: RunRecord[] = [];
    for (const entry of entries) {
      if (!ID_PATTERN.test(entry)) continue;
      const run = await this.readJson<RunRecord>(this.path('runs', entry, 'run.json'));
      if (run !== undefined && run.systemId === systemId) runs.push(run);
    }
    return runs.sort((a, b) =>
      a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : a.id < b.id ? -1 : 1,
    );
  }

  async getRun(systemId: string, runId: string): Promise<RunRecord> {
    const run = ID_PATTERN.test(runId)
      ? await this.readJson<RunRecord>(this.path('runs', runId, 'run.json'))
      : undefined;
    // Another tenant's run is indistinguishable from a missing one.
    if (run === undefined || run.systemId !== systemId)
      throw new ApiError(404, `run "${runId}" not found`);
    return run;
  }

  async submitRun(body: unknown): Promise<RunRecord> {
    if (body === null || typeof body !== 'object')
      throw new ApiError(400, 'request body must be a JSON object');
    const raw = body as Record<string, unknown>;
    const systemId =
      raw.systemId === undefined
        ? this.options.defaultSystemId
        : requireId(raw.systemId, 'systemId');
    const sourceId = requireId(raw.sourceId, 'sourceId');
    const source = (await this.listSources(systemId)).find((s) => s.id === sourceId);
    if (source === undefined)
      throw new ApiError(404, `source "${sourceId}" is not registered for system "${systemId}"`);

    const run: RunRecord = {
      id: `run-${randomUUID()}`,
      systemId,
      sourceId,
      status: 'queued',
      submittedAt: this.now(),
    };
    await this.writeJson(this.path('runs', run.id, 'run.json'), run);
    const execution = (this.queue = this.queue.then(() => this.execute(run, source)));
    this.pending.add(execution);
    void execution.finally(() => this.pending.delete(execution));
    return run;
  }

  /** Resolves when every accepted run has finished -- for shutdown and tests. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private async execute(queued: RunRecord, source: RegisteredSource): Promise<void> {
    const startedAt = this.now();
    let run: RunRecord = { ...queued, status: 'running', startedAt };
    await this.writeJson(this.path('runs', run.id, 'run.json'), run);
    const cacheKey = `${source.systemId}/${source.id}`;
    const parseCache = this.parseCaches.get(cacheKey) ?? createJavaParseCache();
    this.parseCaches.set(cacheKey, parseCache);
    try {
      const isLocal = source.locator.startsWith('file:');
      const result = await runPipeline({
        systemId: source.systemId,
        // The run's real start time: the moment this knowledge was derived.
        generatedAt: startedAt,
        source: {
          // History needs the full log; a remote clone is otherwise shallow.
          connector: createGitRepositoryConnector({ cloneDepth: 0 }),
          descriptor: {
            id: `repo://${source.systemId}/${source.id}`,
            sourceType: 'source-code',
            label: source.label,
            locator: source.locator,
            repository: isLocal
              ? { kind: 'local-directory' }
              : { kind: 'git', ...(source.branch === undefined ? {} : { branch: source.branch }) },
          },
        },
        versionStore: this.versions,
        parseCache,
      });
      const outputs: RunOutputs = {
        changelog: result.changelog,
        gaps: result.gaps,
        knowledgeRisk: result.knowledgeRisk,
        evaluation: verifyRoundTrip(
          result.bundle,
          new Map(result.artifacts.map((a) => [a.path, a.content])),
        ),
      };
      await writeFile(this.path('runs', run.id, 'knowledge.okf.yaml'), result.okfYaml, 'utf8');
      await this.writeJson(this.path('runs', run.id, 'outputs.json'), outputs);
      run = {
        ...run,
        status: 'succeeded',
        finishedAt: this.now(),
        versionId: result.version.id,
        stages: result.stages,
        summary: {
          objects: result.bundle.objects.length,
          relationships: result.bundle.relationships.length,
          changes: result.changelog.changes.length,
          gaps: result.gaps.gaps.length,
          coverageScore: result.gaps.coverageScore,
        },
      };
    } catch (error) {
      // Pipeline stage errors are Phoenix's own, client-safe messages. Any
      // other failure (git, filesystem) may carry server paths: logged, not
      // returned.
      const failure =
        error instanceof PipelineStageError
          ? { stage: error.stage, errors: error.errors.slice(0, 20) }
          : { errors: ['the run could not be completed; see the server log for details'] };
      if (!(error instanceof PipelineStageError)) {
        logger.error('analysis run failed', { runId: run.id, err: String(error) });
      }
      run = {
        ...run,
        status: 'failed',
        finishedAt: this.now(),
        ...(error instanceof PipelineStageError ? { stages: error.completedStages } : {}),
        failure,
      };
    }
    await this.writeJson(this.path('runs', run.id, 'run.json'), run);
  }

  // --- Outputs ---------------------------------------------------------------------------------

  private async succeeded(systemId: string, runId: string): Promise<RunRecord> {
    const run = await this.getRun(systemId, runId);
    if (run.status !== 'succeeded') {
      throw new ApiError(
        409,
        `run "${runId}" is ${run.status}; outputs exist only for a succeeded run`,
      );
    }
    return run;
  }

  async outputs(systemId: string, runId: string): Promise<RunOutputs> {
    await this.succeeded(systemId, runId);
    const outputs = await this.readJson<RunOutputs>(this.path('runs', runId, 'outputs.json'));
    if (outputs === undefined) throw new ApiError(500, `outputs of run "${runId}" are missing`);
    return outputs;
  }

  async okfYaml(systemId: string, runId: string): Promise<string> {
    await this.succeeded(systemId, runId);
    return readFile(this.path('runs', runId, 'knowledge.okf.yaml'), 'utf8');
  }

  /** The portable export, re-rendered from the run's immutable graph version (deterministic). */
  async exportPackage(systemId: string, runId: string): Promise<ExportPackage> {
    const run = await this.succeeded(systemId, runId);
    const version =
      run.versionId === undefined ? undefined : await this.versions.get(systemId, run.versionId);
    if (version === undefined)
      throw new ApiError(500, `graph version of run "${runId}" is missing`);
    return exportOkfPackage(version.bundle);
  }

  /** Latest succeeded run of the system, if any. */
  async latestSucceeded(systemId: string): Promise<RunRecord | undefined> {
    return (await this.listRuns(systemId)).filter((r) => r.status === 'succeeded').at(-1);
  }

  /** Drift history from real runs, newest first, in the `DriftRun` contract. */
  async driftHistory(systemId: string): Promise<DriftRun[] | undefined> {
    const runs = (await this.listRuns(systemId)).filter((r) => r.status === 'succeeded');
    if (runs.length === 0) return undefined;
    const history: DriftRun[] = [];
    for (const run of runs) {
      const { changelog } = await this.outputs(systemId, run.id);
      history.push(toDriftRun(changelog));
    }
    return history.reverse();
  }

  async gapItems(systemId: string): Promise<GapItem[] | undefined> {
    const latest = await this.latestSucceeded(systemId);
    if (latest === undefined) return undefined;
    return [...(await this.outputs(systemId, latest.id)).gaps.gaps];
  }
}

let shared: RunService | undefined;

/** The process-wide run service, created on first use from the environment. */
export function getRunService(): RunService {
  shared ??= new RunService(runServiceOptionsFromEnv());
  return shared;
}
