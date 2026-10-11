/**
 * P3-03 -- database entities and interactions visible from source (FR-DET-02).
 *
 * A pure function over already-built `JavaFileFacts` -- no CST access.
 *
 *  - A type with a type-level `@Entity` annotation becomes a
 *    `JavaJpaEntityFact`: `@Table(name=...)` supplies the table name,
 *    `@Id`/`@GeneratedValue` mark id fields, `@Column(name=...)` supplies a
 *    column name, and `@OneToMany`/`@ManyToOne`/`@OneToOne`/`@ManyToMany`
 *    become associations (their target type unwrapped from a generic
 *    collection type where present, e.g. `List<CheckoutLine>` -> `CheckoutLine`).
 *  - An interface extending a `*Repository` type (`JpaRepository`,
 *    `CrudRepository`, `PagingAndSortingRepository`, ...) becomes a
 *    `JavaRepositoryFact`: its generic type arguments supply the managed
 *    entity/id types (read via a small targeted regex over the ALREADY-
 *    EXTRACTED `extendsTypes` string, not raw source -- `java-structure.ts`
 *    does not model generic type arguments as structured data, so this is
 *    the narrowest possible place to recover them), and every abstract
 *    method becomes a declared query method, with its `@Query` annotation's
 *    raw text where present (no JPQL parsing).
 *
 * Scope: JPA/Hibernate annotations and Spring Data repository interfaces
 * only. Raw SQL migrations (Flyway/Liquibase) and MyBatis mappers are a
 * documented, deliberate non-goal for this ticket.
 */

import {
  flattenJavaTypes,
  type JavaFileFacts,
  type JavaTypeFact,
  type SourceSpan,
} from './java-structure.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

export type JavaAssociationKind = 'OneToMany' | 'ManyToOne' | 'OneToOne' | 'ManyToMany';

export interface JavaEntityColumnFact {
  fieldName: string;
  columnName?: string;
  javaType: string;
}

export interface JavaEntityAssociationFact {
  fieldName: string;
  kind: JavaAssociationKind;
  targetJavaType: string;
  mappedBy?: string;
}

export interface JavaJpaEntityFact extends SourceSpan {
  qualifiedName: string;
  tableName?: string;
  idFields: string[];
  columns: JavaEntityColumnFact[];
  associations: JavaEntityAssociationFact[];
}

export interface JavaRepositoryQueryMethodFact {
  methodName: string;
  queryAnnotationText?: string;
}

export interface JavaRepositoryFact extends SourceSpan {
  qualifiedName: string;
  extendsRepositoryType?: string;
  entityTypeArgument?: string;
  idTypeArgument?: string;
  declaredQueryMethods: JavaRepositoryQueryMethodFact[];
}

export interface JavaPersistenceFacts {
  entities: JavaJpaEntityFact[];
  repositories: JavaRepositoryFact[];
}

const ASSOCIATION_ANNOTATIONS: readonly JavaAssociationKind[] = [
  'OneToMany',
  'ManyToOne',
  'OneToOne',
  'ManyToMany',
];
const REPOSITORY_SUFFIX_PATTERN = /(\w*Repository)\s*<\s*([^,>]+?)\s*,\s*([^,>]+?)\s*>/;

function stringAttribute(
  attributes: Record<string, { value?: string | number | boolean }> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key]?.value;
  return typeof value === 'string' ? value : undefined;
}

/** Strips generics/array brackets, e.g. "List<CheckoutLine>" -> "CheckoutLine", falling back to the base type when there is no generic argument. */
function unwrapCollectionElementType(javaType: string): string {
  const match = /<\s*([^<>]+?)\s*>/.exec(javaType);
  return match?.[1] ?? javaType.replace(/\[\s*\]/g, '').trim();
}

function extractEntity(type: JavaTypeFact): JavaJpaEntityFact | undefined {
  const entityAnnotation = type.annotations.find((a) => a.name === 'Entity');
  if (entityAnnotation === undefined) return undefined;

  const tableAnnotation = type.annotations.find((a) => a.name === 'Table');
  const tableName = stringAttribute(tableAnnotation?.attributes, 'name');

  const idFields: string[] = [];
  const columns: JavaEntityColumnFact[] = [];
  const associations: JavaEntityAssociationFact[] = [];

  for (const field of type.fields) {
    if (field.annotations.some((a) => a.name === 'Id')) idFields.push(field.name);

    const columnAnnotation = field.annotations.find((a) => a.name === 'Column');
    const columnName = stringAttribute(columnAnnotation?.attributes, 'name');
    columns.push({
      fieldName: field.name,
      javaType: field.type,
      ...(columnName === undefined ? {} : { columnName }),
    });

    const associationAnnotation = field.annotations.find((a) =>
      ASSOCIATION_ANNOTATIONS.includes(a.name as JavaAssociationKind),
    );
    if (associationAnnotation !== undefined) {
      const mappedBy = stringAttribute(associationAnnotation.attributes, 'mappedBy');
      associations.push({
        fieldName: field.name,
        kind: associationAnnotation.name as JavaAssociationKind,
        targetJavaType: unwrapCollectionElementType(field.type),
        ...(mappedBy === undefined ? {} : { mappedBy }),
      });
    }
  }

  return {
    path: type.path,
    startLine: type.startLine,
    ...(type.endLine === undefined ? {} : { endLine: type.endLine }),
    qualifiedName: type.qualifiedName,
    ...(tableName === undefined ? {} : { tableName }),
    idFields,
    columns,
    associations,
  };
}

function extractRepository(type: JavaTypeFact): JavaRepositoryFact | undefined {
  if (type.kind !== 'interface') return undefined;
  const repositoryExtends = type.extendsTypes.find((e) => REPOSITORY_SUFFIX_PATTERN.test(e));
  if (repositoryExtends === undefined) return undefined;

  const match = REPOSITORY_SUFFIX_PATTERN.exec(repositoryExtends);
  const extendsRepositoryType = match?.[1];
  const entityTypeArgument = match?.[2]?.trim();
  const idTypeArgument = match?.[3]?.trim();

  const declaredQueryMethods: JavaRepositoryQueryMethodFact[] = type.methods.map((method) => {
    const queryAnnotation = method.annotations.find((a) => a.name === 'Query');
    const queryText = queryAnnotation?.attributes.value;
    const queryAnnotationText = typeof queryText?.value === 'string' ? queryText.value : undefined;
    return {
      methodName: method.name,
      ...(queryAnnotationText === undefined ? {} : { queryAnnotationText }),
    };
  });

  return {
    path: type.path,
    startLine: type.startLine,
    ...(type.endLine === undefined ? {} : { endLine: type.endLine }),
    qualifiedName: type.qualifiedName,
    ...(extendsRepositoryType === undefined ? {} : { extendsRepositoryType }),
    ...(entityTypeArgument === undefined ? {} : { entityTypeArgument }),
    ...(idTypeArgument === undefined ? {} : { idTypeArgument }),
    declaredQueryMethods,
  };
}

/** Extracts every JPA entity and Spring Data repository from already-built structural facts. */
export function extractJavaPersistence(filesFacts: readonly JavaFileFacts[]): JavaPersistenceFacts {
  const allTypes = filesFacts.flatMap((file) => flattenJavaTypes(file.types));

  const entities = allTypes
    .map(extractEntity)
    .filter((e): e is JavaJpaEntityFact => e !== undefined)
    .sort((a, b) => compareCodeUnits(a.qualifiedName, b.qualifiedName));

  const repositories = allTypes
    .map(extractRepository)
    .filter((r): r is JavaRepositoryFact => r !== undefined)
    .sort((a, b) => compareCodeUnits(a.qualifiedName, b.qualifiedName));

  return { entities, repositories };
}
