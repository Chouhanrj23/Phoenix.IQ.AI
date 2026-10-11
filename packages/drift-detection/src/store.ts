/**
 * P8 -- FR-KG-05: where graph versions live, immutably.
 *
 * A version is written once under its content address and never rewritten:
 * saving the same id again is a no-op when the content is identical, and an
 * error when it is not (which would mean the content address was
 * computed from different data -- a defect, never something to overwrite).
 * "Identical" means the content the id addresses (`versionContent`): the
 * same knowledge re-derived by a later run, with later timestamps, is the
 * same version and is not a conflict; the first-stored copy is kept.
 * Each system (tenant) has its own history; nothing is listed across systems
 * (FR-ORC-04).
 *
 * Two implementations: in-memory (tests, one-off runs) and filesystem (the
 * API's durable workspace). The filesystem store writes each version to a
 * temporary file and renames it into place, so a crash never leaves a
 * half-written version behind.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { versionContent, type GraphVersion } from './version.js';

/** The ordered history of one system: version ids, oldest first. */
export interface GraphVersionStore {
  save(version: GraphVersion): Promise<void>;
  get(systemId: string, versionId: string): Promise<GraphVersion | undefined>;
  /** Every version id for the system, oldest first. */
  list(systemId: string): Promise<readonly string[]>;
  latest(systemId: string): Promise<GraphVersion | undefined>;
}

/** Saving different content under an existing version id. */
export class GraphVersionConflictError extends Error {
  constructor(systemId: string, versionId: string) {
    super(
      `graph version "${versionId}" of system "${systemId}" already exists with different content; versions are immutable`,
    );
    this.name = 'GraphVersionConflictError';
  }
}

export function createInMemoryGraphVersionStore(): GraphVersionStore {
  const bySystem = new Map<string, Map<string, GraphVersion>>();
  const order = new Map<string, string[]>();
  return {
    save(version) {
      const versions = bySystem.get(version.systemId) ?? new Map<string, GraphVersion>();
      const existing = versions.get(version.id);
      if (existing !== undefined) {
        if (versionContent(existing.bundle) !== versionContent(version.bundle)) {
          return Promise.reject(new GraphVersionConflictError(version.systemId, version.id));
        }
        return Promise.resolve();
      }
      versions.set(version.id, version);
      bySystem.set(version.systemId, versions);
      order.set(version.systemId, [...(order.get(version.systemId) ?? []), version.id]);
      return Promise.resolve();
    },
    get(systemId, versionId) {
      return Promise.resolve(bySystem.get(systemId)?.get(versionId));
    },
    list(systemId) {
      return Promise.resolve([...(order.get(systemId) ?? [])]);
    },
    latest(systemId) {
      const ids = order.get(systemId) ?? [];
      const last = ids[ids.length - 1];
      return Promise.resolve(last === undefined ? undefined : bySystem.get(systemId)?.get(last));
    },
  };
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function segment(value: string, what: string): string {
  // Ids become directory and file names: refuse anything that could escape
  // the store's directory or collide after encoding.
  if (!SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${what} "${value}" is not a safe storage name ([A-Za-z0-9._-] only)`);
  }
  return value;
}

/**
 * Durable store under `directory`: `<systemId>/<versionId>.json` per version
 * and `<systemId>/index.json` with the ordered history.
 */
export function createFileGraphVersionStore(directory: string): GraphVersionStore {
  const systemDir = (systemId: string) => join(directory, segment(systemId, 'systemId'));
  const versionPath = (systemId: string, versionId: string) =>
    join(systemDir(systemId), `${segment(versionId, 'version id')}.json`);
  const indexPath = (systemId: string) => join(systemDir(systemId), 'index.json');

  async function readJson<T>(path: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async function writeAtomically(path: string, content: string): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  }

  async function list(systemId: string): Promise<readonly string[]> {
    return (await readJson<string[]>(indexPath(systemId))) ?? [];
  }

  async function get(systemId: string, versionId: string): Promise<GraphVersion | undefined> {
    return readJson<GraphVersion>(versionPath(systemId, versionId));
  }

  return {
    async save(version) {
      await mkdir(systemDir(version.systemId), { recursive: true });
      const existing = await get(version.systemId, version.id);
      if (existing !== undefined) {
        if (versionContent(existing.bundle) !== versionContent(version.bundle)) {
          throw new GraphVersionConflictError(version.systemId, version.id);
        }
        return;
      }
      await writeAtomically(versionPath(version.systemId, version.id), JSON.stringify(version));
      const ids = await list(version.systemId);
      await writeAtomically(indexPath(version.systemId), JSON.stringify([...ids, version.id]));
    },
    get,
    list,
    async latest(systemId) {
      const ids = await list(systemId);
      const last = ids[ids.length - 1];
      return last === undefined ? undefined : get(systemId, last);
    },
  };
}
