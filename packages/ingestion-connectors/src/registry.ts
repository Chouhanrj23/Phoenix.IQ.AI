/**
 * P6-01 -- hardens connector *selection* for the many-source-layout world
 * this ticket prepares the framework for.
 *
 * ADR 0013 shipped `selectConnector` deliberately minimal: first-match over a
 * plain array, explicitly "not a registry" (see its Limitations:
 * "`selectConnector` is first-match, not best-match, and deliberately not a
 * registry ... Precedence rules belong to `packages/orchestration`"). That was
 * the right call when exactly one real connector (`git-repository`) existed.
 * It stops being safe once several connectors are registered side by side
 * across several source layouts -- a repository connector, a document-space
 * connector (P6-01), and whatever ticket/log-store connector comes next.
 * Two mistakes that were previously impossible to make become easy to make
 * *silently*:
 *
 *  1. Two connectors registered under the same `id` -- which breaks any
 *     lookup keyed by it, including `Provenance.derivedBy`.
 *  2. A descriptor that more than one registered connector legitimately
 *     claims to support -- previously resolved by array order, which hides a
 *     configuration bug (two connectors overlapping in `sourceTypes` more
 *     than intended) behind whichever one happened to be registered first.
 *
 * `ConnectorRegistry` lives here, in `ingestion-connectors`, rather than in
 * `packages/orchestration`: both failure modes are about the connector SET
 * itself, not about sequencing a pipeline run. `orchestration` still owns
 * run-level policy (retry order, fallback across a degraded source) built on
 * top of whatever this resolves -- that division is unchanged from ADR 0013.
 *
 * `selectConnector` is untouched and still exported: a caller with at most
 * one plausible connector per descriptor has no need for the extra ceremony
 * of construcing a registry, and every existing caller of it keeps working.
 */

import type { SourceConnector } from './connector.js';
import { validateSourceConnector } from './connector.js';
import type { SourceDescriptor } from './descriptor.js';

/** Thrown by `createConnectorRegistry` when the connector SET itself is malformed. */
export class ConnectorRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorRegistrationError';
  }
}

/** Thrown by `ConnectorRegistry.resolve` when no registered connector supports a descriptor. */
export class NoMatchingConnectorError extends Error {
  readonly descriptor: SourceDescriptor;

  constructor(descriptor: SourceDescriptor) {
    super(
      `no registered connector supports descriptor ${JSON.stringify(descriptor.id)} ` +
        `(sourceType ${JSON.stringify(descriptor.sourceType)})`,
    );
    this.name = 'NoMatchingConnectorError';
    this.descriptor = descriptor;
  }
}

/** Thrown by `ConnectorRegistry.resolve` when more than one registered connector claims a descriptor. */
export class AmbiguousConnectorError extends Error {
  readonly descriptor: SourceDescriptor;
  readonly connectorIds: readonly string[];

  constructor(descriptor: SourceDescriptor, connectorIds: readonly string[]) {
    super(
      `descriptor ${JSON.stringify(descriptor.id)} is supported by more than one registered ` +
        `connector (${connectorIds.join(', ')}) — this is a registration bug, not a runtime ` +
        `choice; narrow one connector's supports() or register only one of them`,
    );
    this.name = 'AmbiguousConnectorError';
    this.descriptor = descriptor;
    this.connectorIds = connectorIds;
  }
}

export interface ConnectorRegistry {
  /** Every registered connector, in registration order. */
  readonly connectors: readonly SourceConnector[];
  /** Looks up a connector by its declared `id`. `undefined` when none is registered under it. */
  get(id: string): SourceConnector | undefined;
  /**
   * The one connector that supports `descriptor`. Throws `NoMatchingConnectorError` when none
   * does, and `AmbiguousConnectorError` when more than one does -- resolving ambiguity by
   * registration order the way `selectConnector` does would hide exactly the configuration mistake
   * a registry exists to surface.
   */
  resolve(descriptor: SourceDescriptor): SourceConnector;
}

/**
 * Builds a `ConnectorRegistry`, validating the connector set up front rather
 * than discovering a problem the first time some descriptor happens to hit
 * it.
 *
 * Throws `ConnectorRegistrationError` for a structurally invalid connector
 * (delegating to `validateSourceConnector`, the same runtime check ADR 0013
 * defined for one connector at a time) or a duplicate `id`.
 */
export function createConnectorRegistry(connectors: readonly SourceConnector[]): ConnectorRegistry {
  const byId = new Map<string, SourceConnector>();

  for (const connector of connectors) {
    const validation = validateSourceConnector(connector);
    if (!validation.valid) {
      const id = isRecordWithId(connector) ? connector.id : '<unknown>';
      throw new ConnectorRegistrationError(
        `connector ${JSON.stringify(id)} is not a valid SourceConnector — ` +
          validation.errors.join('; '),
      );
    }
    if (byId.has(connector.id)) {
      throw new ConnectorRegistrationError(
        `duplicate connector id ${JSON.stringify(connector.id)} — every registered connector must ` +
          `have a unique id, since it is recorded as Provenance.derivedBy and looked up by callers`,
      );
    }
    byId.set(connector.id, connector);
  }

  return {
    connectors: [...connectors],

    get(id: string): SourceConnector | undefined {
      return byId.get(id);
    },

    resolve(descriptor: SourceDescriptor): SourceConnector {
      const matches = connectors.filter((connector) => connector.supports(descriptor));
      if (matches.length > 1) {
        throw new AmbiguousConnectorError(
          descriptor,
          matches.map((connector) => connector.id),
        );
      }
      const [match] = matches;
      if (match === undefined) throw new NoMatchingConnectorError(descriptor);
      return match;
    },
  };
}

function isRecordWithId(candidate: unknown): candidate is { id: unknown } {
  return typeof candidate === 'object' && candidate !== null && 'id' in candidate;
}
