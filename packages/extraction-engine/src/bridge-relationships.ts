/**
 * Phase 4 blocker fix -- bridges already-extracted, already-resolved Java
 * relationship facts (`java-calls.ts`'s type-dependency graph, P3-0X;
 * `java-persistence.ts`'s JPA associations) into real
 * `CanonicalKnowledgeRelationship`s. See `bridge-shared.ts` for the shared
 * rationale (only directly-evidenced mappings bridge; deterministic ids;
 * everything else stays a fact).
 *
 * Root cause this fixes: `extractJavaProject` (`extract-java.ts`) has always
 * hardcoded `relationships: []`. That was not a gap in extraction -- the
 * call graph and type-dependency graph (`java-calls.ts`) and JPA
 * associations (`java-persistence.ts`) were already fully extracted, already
 * resolved (each fact's `unresolved` flag says exactly when its target is a
 * real, known, project-local type), and already carried through
 * provenance/evidence -- it was a gap in MAPPING: nothing ever turned those
 * already-resolved facts into `CanonicalKnowledgeRelationship`s. This file
 * is that missing mapping step, not new extraction logic.
 *
 * Scope is deliberately narrow, matching `bridge-http.ts`/
 * `bridge-persistence.ts`'s own discipline: a relationship is only produced
 * when BOTH its source and target are classes this package already bridged
 * into a canonical object (an `ApiObject` or `EntityObject`). A dependency
 * whose target has no canonical object yet (e.g. a Repository, a plain
 * service class -- neither has an OKF kind) produces no relationship --
 * nothing is invented or guessed to fill that gap.
 *
 * Two non-overlapping sources, each covering evidence the other cannot:
 *
 *  - `bridgeTypeDependencies` -- `paramType`/`returnType`/`extends`/
 *    `implements`/`throws` type-dependency facts. Deliberately EXCLUDES
 *    `fieldType` for any source class that is itself a bridged Entity:
 *    `resolveTypeName`'s generic-stripping (`baseTypeName`) reduces a
 *    collection field like `List<Pet>` to `List`, which is unresolvable and
 *    would silently miss the association entirely -- `bridgeJpaAssociations`
 *    below is the correct, already-unwrapped source for entity field
 *    associations, and using both would double-count the non-collection
 *    case (e.g. a `@ManyToOne` field, which both would otherwise resolve to
 *    the same target).
 *  - `bridgeJpaAssociations` -- `@OneToMany`/`@ManyToOne`/`@OneToOne`/
 *    `@ManyToMany` fields (`JavaEntityAssociationFact`, already
 *    collection-unwrapped by `java-persistence.ts`). Its target is only a
 *    simple type name (no import-resolution context is threaded into
 *    persistence extraction); it is resolved against this run's own bridged
 *    entity qualified names by simple-name match, and ONLY when that match
 *    is unambiguous -- a colliding simple name (two entities of the same
 *    name in different packages) is left unbridged rather than guessed,
 *    the same "resolve only when unambiguous, else leave it" discipline
 *    `java-calls.ts` already established for call targets.
 *
 * `kind: 'dependsOn'` / `kind: 'hasAssociation'`, `category: 'association'`
 * are deliberately generic, cross-domain relationship kinds -- P2-01/P2-02
 * designed `kind` as an open vocabulary precisely so a relationship that
 * isn't owned by any one of the four P2-03..P2-06 domain files (this one
 * spans architecture/domain/integration equally) doesn't need a schema
 * change to exist. `category: 'association'` matches `ontology.ts`'s own
 * definition exactly: "a loose reference between two objects with no
 * ownership implied" -- true of every relation bridged here. The original,
 * more specific relation (`fieldType`/`paramType`/... or the JPA
 * association kind/field name) is preserved verbatim in `attributes`, not
 * discarded.
 */

import type { CanonicalKnowledgeRelationship } from '@phoenix-ai/knowledge-graph';
import type { JavaTypeDependencyFact } from './java-calls.js';
import type { JavaJpaEntityFact } from './java-persistence.js';
import { deterministicId, evidenceFor, simpleNameOf, type BridgeOptions } from './bridge-shared.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

function relationshipProvenance(
  options: BridgeOptions,
): CanonicalKnowledgeRelationship['metadata'] {
  return {
    provenance: [
      {
        sourceId: options.sourceId,
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: options.generatedAt,
      },
    ],
    confidence: { level: 'high' },
  };
}

/**
 * Bridges resolved, non-`fieldType` type-dependency facts (`extends`,
 * `implements`, `paramType`, `returnType`, `throws`) into relationships,
 * but only between two already-bridged canonical objects.
 * `entityQualifiedNames` identifies which bridged objects are Entities, so
 * `fieldType` dependencies originating from one can be skipped here (see
 * file header) without needing to inspect `bridgedObjectIdsByQualifiedName`
 * for kind information it doesn't carry.
 */
export function bridgeTypeDependencies(
  typeDependencies: readonly JavaTypeDependencyFact[],
  bridgedObjectIdsByQualifiedName: ReadonlyMap<string, string>,
  entityQualifiedNames: ReadonlySet<string>,
  options: BridgeOptions,
): CanonicalKnowledgeRelationship[] {
  const relationships: CanonicalKnowledgeRelationship[] = [];

  for (const dependency of typeDependencies) {
    if (dependency.unresolved || dependency.toQualifiedName === undefined) continue;
    if (
      dependency.relation === 'fieldType' &&
      entityQualifiedNames.has(dependency.fromQualifiedName)
    ) {
      continue;
    }

    const sourceObjectId = bridgedObjectIdsByQualifiedName.get(dependency.fromQualifiedName);
    const targetObjectId = bridgedObjectIdsByQualifiedName.get(dependency.toQualifiedName);
    if (sourceObjectId === undefined || targetObjectId === undefined) continue;
    if (sourceObjectId === targetObjectId) continue;

    relationships.push({
      id: deterministicId(
        'relationship',
        'dependsOn',
        dependency.relation,
        sourceObjectId,
        targetObjectId,
        `${dependency.span.path}:${dependency.span.startLine}`,
      ),
      category: 'association',
      kind: 'dependsOn',
      sourceObjectId,
      targetObjectId,
      attributes: { relation: dependency.relation },
      metadata: relationshipProvenance(options),
      evidence: [evidenceFor(dependency.span, options, 'dependsOn', dependency.fromQualifiedName)],
      confidenceDetail: { basis: 'observed' },
    });
  }

  return relationships.sort((a, b) => compareCodeUnits(a.id, b.id));
}

/**
 * Bridges JPA association facts (`@OneToMany`/`@ManyToOne`/`@OneToOne`/
 * `@ManyToMany`) into relationships between two already-bridged
 * `EntityObject`s. See file header for the simple-name resolution
 * discipline.
 */
export function bridgeJpaAssociations(
  entities: readonly JavaJpaEntityFact[],
  bridgedObjectIdsByQualifiedName: ReadonlyMap<string, string>,
  options: BridgeOptions,
): CanonicalKnowledgeRelationship[] {
  const qualifiedNamesBySimpleName = new Map<string, string[]>();
  for (const entity of entities) {
    const simple = simpleNameOf(entity.qualifiedName);
    const existing = qualifiedNamesBySimpleName.get(simple);
    if (existing === undefined) qualifiedNamesBySimpleName.set(simple, [entity.qualifiedName]);
    else existing.push(entity.qualifiedName);
  }

  const relationships: CanonicalKnowledgeRelationship[] = [];

  for (const entity of entities) {
    const sourceObjectId = bridgedObjectIdsByQualifiedName.get(entity.qualifiedName);
    if (sourceObjectId === undefined) continue;

    for (const association of entity.associations) {
      const candidates = qualifiedNamesBySimpleName.get(association.targetJavaType);
      if (candidates === undefined || candidates.length !== 1) continue;
      const targetQualifiedName = candidates[0];
      const targetObjectId =
        targetQualifiedName === undefined
          ? undefined
          : bridgedObjectIdsByQualifiedName.get(targetQualifiedName);
      if (targetObjectId === undefined || targetObjectId === sourceObjectId) continue;

      relationships.push({
        id: deterministicId(
          'relationship',
          'hasAssociation',
          association.kind,
          sourceObjectId,
          targetObjectId,
          `${entity.path}:${entity.startLine}:${association.fieldName}`,
        ),
        category: 'association',
        kind: 'hasAssociation',
        sourceObjectId,
        targetObjectId,
        attributes: {
          associationKind: association.kind,
          fieldName: association.fieldName,
          ...(association.mappedBy === undefined ? {} : { mappedBy: association.mappedBy }),
        },
        metadata: relationshipProvenance(options),
        evidence: [
          evidenceFor(
            entity,
            options,
            'hasAssociation',
            `${entity.qualifiedName}.${association.fieldName}`,
          ),
        ],
        confidenceDetail: { basis: 'observed' },
      });
    }
  }

  return relationships.sort((a, b) => compareCodeUnits(a.id, b.id));
}
