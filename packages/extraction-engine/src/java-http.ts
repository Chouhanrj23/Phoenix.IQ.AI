/**
 * P3-03 -- controllers, routes, HTTP methods, and API metadata (FR-DET-03).
 *
 * A pure function over already-built `JavaFileFacts` -- no CST access. A
 * type is a controller iff it carries a type-level `@RestController` or
 * `@Controller` annotation; its `@RequestMapping` supplies the class-level
 * base path(s); each handler method's `@GetMapping`/`@PostMapping`/
 * `@PutMapping`/`@DeleteMapping`/`@PatchMapping` (or a method-level
 * `@RequestMapping`) supplies the HTTP method and sub-path(s), joined with
 * the class-level path(s) by `joinPaths` -- a small, deterministic,
 * independently-tested normalizer. Parameter metadata is read only from
 * `@PathVariable`/`@RequestParam`/`@RequestBody`/`@RequestHeader` --
 * Spring's IMPLICIT binding rules (an unannotated parameter that happens to
 * look like a request body) are not inferred, since that requires real
 * Spring semantics this deterministic pass does not have (a documented gap,
 * not an oversight).
 *
 * Scope: Spring MVC only. JAX-RS (`@Path`/`@GET`/...) is a documented,
 * deliberate non-goal for this ticket.
 */

import {
  flattenJavaTypes,
  type JavaFileFacts,
  type JavaAnnotationFact,
  type JavaMethodFact,
  type SourceSpan,
} from './java-structure.js';

export type JavaHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ANY';

export type JavaRouteParameterKind = 'path' | 'query' | 'body' | 'header';

export interface JavaRouteParameterFact {
  name: string;
  kind: JavaRouteParameterKind;
  javaType: string;
}

export interface JavaRouteFact extends SourceSpan {
  httpMethod: JavaHttpMethod;
  path: string;
  handlerMethod: string;
  parameters: JavaRouteParameterFact[];
}

export interface JavaControllerFact extends SourceSpan {
  qualifiedName: string;
  classLevelPaths: string[];
  routes: JavaRouteFact[];
}

const MAPPING_ANNOTATION_METHODS: Record<string, JavaHttpMethod> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
};

const PARAMETER_ANNOTATION_KINDS: Record<string, JavaRouteParameterKind> = {
  PathVariable: 'path',
  RequestParam: 'query',
  RequestBody: 'body',
  RequestHeader: 'header',
};

const KNOWN_HTTP_METHODS: readonly JavaHttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const REQUEST_METHOD_ENUM_PATTERN = /RequestMethod\.(\w+)/;

function pathsFromAnnotation(annotation: JavaAnnotationFact | undefined): string[] {
  if (annotation === undefined) return [];
  const attribute = annotation.attributes.value ?? annotation.attributes.path;
  if (attribute === undefined) return [];
  if (attribute.values !== undefined)
    return attribute.values.filter((v): v is string => typeof v === 'string');
  return typeof attribute.value === 'string' ? [attribute.value] : [];
}

function httpMethodFromRequestMapping(annotation: JavaAnnotationFact): JavaHttpMethod {
  const raw =
    annotation.attributes.method?.raw ?? annotation.attributes.method?.values?.join(',') ?? '';
  const match = REQUEST_METHOD_ENUM_PATTERN.exec(raw);
  const name = match?.[1];
  return name !== undefined && (KNOWN_HTTP_METHODS as readonly string[]).includes(name)
    ? (name as JavaHttpMethod)
    : 'ANY';
}

interface MappingAnnotation {
  annotation: JavaAnnotationFact;
  httpMethod: JavaHttpMethod;
}

function mappingAnnotationOf(
  annotations: readonly JavaAnnotationFact[],
): MappingAnnotation | undefined {
  for (const annotation of annotations) {
    const mapped = MAPPING_ANNOTATION_METHODS[annotation.name];
    if (mapped !== undefined) return { annotation, httpMethod: mapped };
    if (annotation.name === 'RequestMapping')
      return { annotation, httpMethod: httpMethodFromRequestMapping(annotation) };
  }
  return undefined;
}

/** Joins class-level and method-level path(s) into every resulting route path, deterministically and without duplicates. */
export function joinPaths(classPaths: readonly string[], methodPaths: readonly string[]): string[] {
  const bases = classPaths.length === 0 ? [''] : classPaths;
  const subs = methodPaths.length === 0 ? [''] : methodPaths;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const base of bases) {
    for (const sub of subs) {
      const joined = joinOnePath(base, sub);
      if (!seen.has(joined)) {
        seen.add(joined);
        result.push(joined);
      }
    }
  }
  return result;
}

function joinOnePath(base: string, sub: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedSub = sub.length === 0 ? '/' : sub.startsWith('/') ? sub : `/${sub}`;
  const joined =
    normalizedSub === '/' && trimmedBase !== '' ? trimmedBase : `${trimmedBase}${normalizedSub}`;
  if (joined.length === 0) return '/';
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
}

function routeParametersOf(method: JavaMethodFact): JavaRouteParameterFact[] {
  return method.parameters.flatMap((parameter) => {
    for (const annotation of parameter.annotations) {
      const kind = PARAMETER_ANNOTATION_KINDS[annotation.name];
      if (kind === undefined) continue;
      const explicitName = annotation.attributes.value?.value ?? annotation.attributes.name?.value;
      const name = typeof explicitName === 'string' ? explicitName : parameter.name;
      return [{ name, kind, javaType: parameter.type }];
    }
    return [];
  });
}

function routesOf(classLevelPaths: string[], methods: readonly JavaMethodFact[]): JavaRouteFact[] {
  return methods.flatMap((method) => {
    const mapping = mappingAnnotationOf(method.annotations);
    if (mapping === undefined) return [];
    const methodPaths = pathsFromAnnotation(mapping.annotation);
    const paths = joinPaths(classLevelPaths, methodPaths);
    return paths.map((path) => ({
      path,
      startLine: method.startLine,
      ...(method.endLine === undefined ? {} : { endLine: method.endLine }),
      httpMethod: mapping.httpMethod,
      handlerMethod: method.name,
      parameters: routeParametersOf(method),
    }));
  });
}

/** Extracts every Spring MVC controller and its routes from already-built structural facts. */
export function extractJavaHttp(filesFacts: readonly JavaFileFacts[]): JavaControllerFact[] {
  const controllers = filesFacts.flatMap((file) =>
    flattenJavaTypes(file.types).flatMap((type) => {
      const isController = type.annotations.some(
        (a) => a.name === 'RestController' || a.name === 'Controller',
      );
      if (!isController) return [];

      const requestMapping = type.annotations.find((a) => a.name === 'RequestMapping');
      const classLevelPaths = pathsFromAnnotation(requestMapping);

      return [
        {
          path: type.path,
          startLine: type.startLine,
          ...(type.endLine === undefined ? {} : { endLine: type.endLine }),
          qualifiedName: type.qualifiedName,
          classLevelPaths,
          routes: routesOf(classLevelPaths, type.methods),
        },
      ];
    }),
  );

  return controllers.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
}
