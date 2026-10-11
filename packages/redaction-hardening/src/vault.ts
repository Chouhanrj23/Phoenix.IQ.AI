/**
 * P8 -- FR-SEC-03: "The token-to-location mapping shall be held in an
 * encrypted store never exposed to inference models or logs."
 *
 * Each redacted value is encrypted with AES-256-GCM under a key generated
 * for this vault alone and held only in this closure -- it is never
 * serialised, returned, or logged. The vault is in-process and NON-RETAINING
 * by design (BR-12): when the process ends, the key is gone and the
 * ciphertexts are unrecoverable. Persisting redacted values would need a
 * managed key store, which Phoenix does not have; this module does not
 * pretend otherwise.
 *
 * The vault deliberately renders as an opaque summary under `JSON.stringify`
 * and `console.log`/`util.inspect`, so a careless log line cannot leak it.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface RedactionVaultEntry {
  readonly token: string;
  /** Where the value was, so an authorised human can find it -- never the value. */
  readonly sourceId: string;
  readonly path: string;
  readonly line: number;
}

export interface RedactionVault {
  /** Number of values held. */
  readonly size: number;
  /** Stores a value under `token`. Overwrites an existing entry for the same token. */
  put(entry: RedactionVaultEntry, value: string): void;
  has(token: string): boolean;
  /** Locations of every held value -- safe to report; contains no secret material. */
  entries(): readonly RedactionVaultEntry[];
  /**
   * Decrypts one value. For an AUTHORISED HUMAN restoring a value, never for
   * the pipeline: no stage calls this, and nothing it returns may be passed to
   * a model, a log, the graph, or an OKF document.
   */
  reveal(token: string): string | undefined;
}

const INSPECT = Symbol.for('nodejs.util.inspect.custom');

export function createRedactionVault(): RedactionVault {
  const key = randomBytes(32);
  const sealed = new Map<
    string,
    { entry: RedactionVaultEntry; iv: Buffer; tag: Buffer; data: Buffer }
  >();

  const vault: RedactionVault & { toJSON(): unknown; [INSPECT](): string } = {
    get size() {
      return sealed.size;
    },
    put(entry, value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      sealed.set(entry.token, { entry, iv, tag: cipher.getAuthTag(), data });
    },
    has(token) {
      return sealed.has(token);
    },
    entries() {
      return [...sealed.values()].map((record) => record.entry);
    },
    reveal(token) {
      const record = sealed.get(token);
      if (record === undefined) return undefined;
      const decipher = createDecipheriv('aes-256-gcm', key, record.iv);
      decipher.setAuthTag(record.tag);
      return Buffer.concat([decipher.update(record.data), decipher.final()]).toString('utf8');
    },
    toJSON() {
      return { redactionVault: true, size: sealed.size };
    },
    [INSPECT]() {
      return `RedactionVault { size: ${sealed.size} }`;
    },
  };
  return vault;
}
