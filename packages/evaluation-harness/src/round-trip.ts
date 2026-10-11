/**
 * P8 -- FR-EVA-03: round-trip verification. Every concrete claim Phoenix
 * makes is re-checked against the exact source it cites, by an independent
 * reading (plain text patterns over the cited file -- not the parser or the
 * extractor that produced the claim):
 *
 *   - an API operation "METHOD /path"  -> the cited controller declares a
 *     mapping annotation for that method whose class prefix + method path
 *     equals the path;
 *   - an entity's physical table        -> the cited class declares
 *     `@Table(name = "<table>")`;
 *   - a deployment unit's image         -> the cited descriptor declares
 *     that image (`image:` or `FROM`).
 *
 * A claim the cited source contradicts is a FAILURE. A claim whose source is
 * not available to the checker is counted as unverifiable -- never as
 * confirmed.
 */

import type {
  CanonicalKnowledgeBundle,
  CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';

export type RoundTripClaimKind = 'api-operation' | 'table' | 'image';

export interface RoundTripResult {
  readonly elementId: string;
  readonly label: string;
  readonly claimKind: RoundTripClaimKind;
  readonly claim: string;
  readonly cited: string;
  readonly outcome: 'confirmed' | 'contradicted' | 'unverifiable';
  readonly reason?: string;
}

export interface RoundTripReport {
  readonly checked: number;
  readonly confirmed: number;
  readonly contradicted: number;
  readonly unverifiable: number;
  /** confirmed / (confirmed + contradicted); 1 when nothing was verifiable. */
  readonly passRate: number;
  readonly results: readonly RoundTripResult[];
}

const HTTP_ANNOTATION =
  /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*(?:(?:value|path)\s*=\s*)?"([^"]*)"[^)]*\))?/g;
const CLASS_PREFIX =
  /@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?"([^"]*)"[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+)?(?:abstract\s+|final\s+)*class\b/;

function joinPath(prefix: string, path: string): string {
  const joined = `/${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

/** The operations a controller file declares, read independently of the extractor. */
export function declaredOperations(source: string): Set<string> {
  const prefix = CLASS_PREFIX.exec(source)?.[1] ?? '';
  const operations = new Set<string>();
  for (const match of source.matchAll(HTTP_ANNOTATION)) {
    operations.add(`${match[1]!.toUpperCase()} ${joinPath(prefix, match[2] ?? '')}`);
  }
  return operations;
}

function citedPath(object: CanonicalKnowledgeObject): string | undefined {
  const locator = object.evidence.find((e) => e.locator !== undefined)?.locator;
  return locator?.split('#')[0];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function verifyRoundTrip(
  bundle: CanonicalKnowledgeBundle,
  files: ReadonlyMap<string, string>,
): RoundTripReport {
  const results: RoundTripResult[] = [];
  const observed = bundle.objects
    .filter((o) => o.confidenceDetail?.basis !== 'derived')
    .sort((a, b) => compareCodeUnits(a.identity.id, b.identity.id));

  for (const object of observed) {
    const cited = citedPath(object) ?? '(no evidence)';
    const source = files.get(cited);
    const push = (claimKind: RoundTripClaimKind, claim: string, ok: boolean, reason: string) =>
      results.push({
        elementId: object.identity.id,
        label: object.label,
        claimKind,
        claim,
        cited,
        outcome: source === undefined ? 'unverifiable' : ok ? 'confirmed' : 'contradicted',
        ...(source === undefined
          ? { reason: 'the cited source is not available to the checker' }
          : ok
            ? {}
            : { reason }),
      });

    if (object.kind === 'integration.api') {
      const declared = source === undefined ? new Set<string>() : declaredOperations(source);
      const operations = Array.isArray(object.attributes.operations)
        ? object.attributes.operations
        : [];
      for (const op of operations) {
        const name = (op as { name?: unknown }).name;
        if (typeof name !== 'string') continue;
        push(
          'api-operation',
          name,
          declared.has(name),
          `the cited file declares ${[...declared].sort(compareCodeUnits).join(', ') || 'no HTTP mapping'}`,
        );
      }
    }
    if (object.kind === 'domain.entity' && typeof object.attributes.description === 'string') {
      const table = /^Maps to table "([^"]+)"/.exec(object.attributes.description)?.[1];
      if (table !== undefined) {
        const ok =
          source !== undefined &&
          new RegExp(`@Table\\s*\\([^)]*name\\s*=\\s*"${escapeRegExp(table)}"`).test(source);
        push('table', table, ok, `the cited file does not declare @Table(name = "${table}")`);
      }
    }
    if (object.kind === 'deployment.unit' && typeof object.attributes.image === 'string') {
      const image = object.attributes.image;
      const ok =
        source !== undefined &&
        new RegExp(
          `(^|\\n)\\s*(-\\s*)?(image:\\s*["']?|FROM\\s+(--\\S+\\s+)*)${escapeRegExp(image)}(["']?\\s|$)`,
          'i',
        ).test(source);
      push('image', image, ok, `the cited file does not declare image ${image}`);
    }
  }

  const count = (outcome: RoundTripResult['outcome']) =>
    results.filter((r) => r.outcome === outcome).length;
  const confirmed = count('confirmed');
  const contradicted = count('contradicted');
  return {
    checked: results.length,
    confirmed,
    contradicted,
    unverifiable: count('unverifiable'),
    passRate:
      confirmed + contradicted === 0
        ? 1
        : Math.round((confirmed / (confirmed + contradicted)) * 1000) / 1000,
    results,
  };
}
