/**
 * P8 -- FR-DFT-01: "On re-run, the system shall re-process only artifacts
 * changed since the prior version."
 *
 * Parsing is the expensive step of Java extraction, so its result is cached
 * per file, keyed by a hash of the file's path AND content: an unchanged
 * file is never parsed again, and a changed file can never be served a stale
 * parse. Cross-file analysis (call graph, type resolution, bridging) still
 * runs over every file on every run, because it legitimately depends on all
 * of them -- so the output is identical with or without the cache.
 *
 * The cache holds parse trees, so it lives as long as its owner keeps it
 * (e.g. the API process across runs of one source); `stats` says how much
 * work the last run reused.
 */

import { createHash } from 'node:crypto';
import type { JavaParseResult } from './java-parser-adapter.js';
import type { JavaFileFacts } from './java-structure.js';

export type CachedJavaParse =
  | { readonly result: JavaParseResult & { ok: true }; readonly facts: JavaFileFacts }
  | { readonly result: JavaParseResult & { ok: false } };

export interface JavaParseCache {
  get(path: string, content: string): CachedJavaParse | undefined;
  set(path: string, content: string, entry: CachedJavaParse): void;
  /** Counters since the last `resetStats()`: files parsed vs. reused unchanged. */
  readonly stats: { parsed: number; reused: number };
  resetStats(): void;
  readonly size: number;
}

function keyOf(path: string, content: string): string {
  return createHash('sha256').update(`${path}\u0000${content}`, 'utf8').digest('hex');
}

/** `maxEntries` bounds memory: least-recently-used entries are evicted first. */
export function createJavaParseCache(maxEntries = 20_000): JavaParseCache {
  const entries = new Map<string, CachedJavaParse>();
  const stats = { parsed: 0, reused: 0 };
  return {
    get(path, content) {
      const key = keyOf(path, content);
      const entry = entries.get(key);
      if (entry !== undefined) {
        // Re-insert to mark as most recently used.
        entries.delete(key);
        entries.set(key, entry);
        stats.reused++;
      }
      return entry;
    },
    set(path, content, entry) {
      stats.parsed++;
      entries.set(keyOf(path, content), entry);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    stats,
    resetStats() {
      stats.parsed = 0;
      stats.reused = 0;
    },
    get size() {
      return entries.size;
    },
  };
}
