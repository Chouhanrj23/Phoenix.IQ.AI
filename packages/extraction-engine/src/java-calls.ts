/**
 * P3-03 -- the type-dependency graph and the call graph (FR-DET-01).
 *
 * Two independent passes:
 *
 *  - `typeDependencies` is derived PURELY from already-computed
 *    `JavaFileFacts` (extends/implements/field/param/return/throws type
 *    text is already there as strings) -- no CST access needed.
 *  - `calls` needs a second CST walk per file, specifically because a call
 *    site can be nested arbitrarily deep inside statements/expressions
 *    (blocks, if/for/while/try, lambda bodies, ...), and that grammar is not
 *    boundedly enumerable by hand the way declarations are (`java-structure.ts`).
 *    This is the one place in the package that uses a real
 *    `BaseJavaCstVisitorWithDefaults` subclass, overriding ONLY `primary` --
 *    everything else keeps its default auto-recursion, and the override
 *    explicitly re-`visit`s its own prefix/suffix children so nested calls
 *    (e.g. arguments to a call, `foo(bar())`) are still found.
 *
 * Resolution is DELIBERATELY SHALLOW, by design, not by oversight: there is
 * no `methodInvocation` CST node (calls are reconstructed from
 * `primary`/`primaryPrefix`/`primarySuffix`/`methodInvocationSuffix`), and
 * this package has no classpath or symbol table. A call target resolves
 * only when its qualifier is empty (a bare/implicit-`this` call), literally
 * `this`, or a single simple/imported name matching a known project-local
 * type (`Type.method()`, a static-style call) -- e.g. `paymentClient.charge()`
 * through an instance field is `unresolved: true`, because knowing
 * `paymentClient`'s declared type requires type inference this package does
 * not do. Every call is still recorded, resolved or not -- nothing is
 * dropped.
 */

import { BaseJavaCstVisitorWithDefaults } from 'java-parser';
import type { CstNode } from 'java-parser';
import {
  asNode,
  childNode,
  childNodes,
  childToken,
  resolveLiteral,
  sourceTextOf,
  spanOf,
  type AnyCstNode,
  type ChildBag,
  type SourceSpan,
} from './cst-utils.js';
import { flattenJavaTypes, type JavaFileFacts } from './java-structure.js';

export type JavaTypeDependencyRelation =
  'extends' | 'implements' | 'fieldType' | 'paramType' | 'returnType' | 'throws';

export interface JavaTypeDependencyFact {
  fromQualifiedName: string;
  toName: string;
  toQualifiedName?: string;
  relation: JavaTypeDependencyRelation;
  unresolved: boolean;
  span: SourceSpan;
}

export interface JavaCallFact {
  callerQualifiedName: string;
  callerMethod: string;
  calleeName: string;
  calleeQualifiedName?: string;
  unresolved: boolean;
  span: SourceSpan;
  /** The call's first argument, when it is literally a string (e.g. `System.getenv("KEY")`). Not general argument capture -- narrowly useful for `java-config.ts`. */
  firstStringArgument?: string;
}

// ---------------------------------------------------------------------------
// Type-name resolution shared by both passes
// ---------------------------------------------------------------------------

interface FileContext {
  packageName: string | undefined;
  /** Non-wildcard imports' simple name -> fully-qualified name. */
  importsBySimpleName: Map<string, string>;
}

function buildFileContext(file: JavaFileFacts): FileContext {
  const importsBySimpleName = new Map<string, string>();
  for (const imp of file.imports) {
    if (imp.isWildcard || imp.isStatic) continue;
    const simple = imp.name.split('.').pop();
    if (simple !== undefined) importsBySimpleName.set(simple, imp.name);
  }
  return { packageName: file.packageName, importsBySimpleName };
}

/** Strips generic type arguments and array brackets, e.g. "List<CheckoutItem>" -> "List", "String[]" -> "String". */
function baseTypeName(typeText: string): string {
  const genericsStart = typeText.indexOf('<');
  const withoutGenerics = genericsStart === -1 ? typeText : typeText.slice(0, genericsStart);
  return withoutGenerics.replace(/\[\s*\]/g, '').trim();
}

/** Resolves a (possibly simple) type name against a file's imports/package, then against the project-wide qualified-name index. */
function resolveTypeName(
  rawTypeText: string,
  context: FileContext,
  qualifiedNames: ReadonlySet<string>,
): { toName: string; toQualifiedName?: string } {
  const base = baseTypeName(rawTypeText);

  if (base.includes('.')) {
    return qualifiedNames.has(base) ? { toName: base, toQualifiedName: base } : { toName: base };
  }

  const imported = context.importsBySimpleName.get(base);
  if (imported !== undefined) {
    return qualifiedNames.has(imported)
      ? { toName: imported, toQualifiedName: imported }
      : { toName: imported };
  }

  const samePackageCandidate =
    context.packageName === undefined || context.packageName.length === 0
      ? base
      : `${context.packageName}.${base}`;
  if (qualifiedNames.has(samePackageCandidate))
    return { toName: samePackageCandidate, toQualifiedName: samePackageCandidate };

  return { toName: base };
}

// ---------------------------------------------------------------------------
// Type-dependency graph -- pure, over already-built facts
// ---------------------------------------------------------------------------

function dependencyFact(
  from: string,
  relation: JavaTypeDependencyRelation,
  rawType: string,
  context: FileContext,
  qualifiedNames: ReadonlySet<string>,
  span: SourceSpan,
): JavaTypeDependencyFact {
  const resolved = resolveTypeName(rawType, context, qualifiedNames);
  return {
    fromQualifiedName: from,
    toName: resolved.toName,
    ...(resolved.toQualifiedName === undefined
      ? {}
      : { toQualifiedName: resolved.toQualifiedName }),
    relation,
    unresolved: resolved.toQualifiedName === undefined,
    span,
  };
}

function typeDependenciesOf(
  file: JavaFileFacts,
  context: FileContext,
  qualifiedNames: ReadonlySet<string>,
): JavaTypeDependencyFact[] {
  const facts: JavaTypeDependencyFact[] = [];
  for (const type of flattenJavaTypes(file.types)) {
    const span: SourceSpan = {
      path: type.path,
      startLine: type.startLine,
      ...(type.endLine === undefined ? {} : { endLine: type.endLine }),
    };
    for (const extendedType of type.extendsTypes) {
      facts.push(
        dependencyFact(type.qualifiedName, 'extends', extendedType, context, qualifiedNames, span),
      );
    }
    for (const implementedType of type.implementsTypes) {
      facts.push(
        dependencyFact(
          type.qualifiedName,
          'implements',
          implementedType,
          context,
          qualifiedNames,
          span,
        ),
      );
    }
    for (const field of type.fields) {
      const fieldSpan: SourceSpan = {
        path: field.path,
        startLine: field.startLine,
        ...(field.endLine === undefined ? {} : { endLine: field.endLine }),
      };
      facts.push(
        dependencyFact(
          type.qualifiedName,
          'fieldType',
          field.type,
          context,
          qualifiedNames,
          fieldSpan,
        ),
      );
    }
    for (const method of type.methods) {
      const methodSpan: SourceSpan = {
        path: method.path,
        startLine: method.startLine,
        ...(method.endLine === undefined ? {} : { endLine: method.endLine }),
      };
      if (method.returnType !== 'void') {
        facts.push(
          dependencyFact(
            type.qualifiedName,
            'returnType',
            method.returnType,
            context,
            qualifiedNames,
            methodSpan,
          ),
        );
      }
      for (const parameter of method.parameters) {
        facts.push(
          dependencyFact(
            type.qualifiedName,
            'paramType',
            parameter.type,
            context,
            qualifiedNames,
            methodSpan,
          ),
        );
      }
      for (const thrown of method.throwsTypes) {
        facts.push(
          dependencyFact(type.qualifiedName, 'throws', thrown, context, qualifiedNames, methodSpan),
        );
      }
    }
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Call graph -- CST walk per file
// ---------------------------------------------------------------------------

interface MethodSite {
  callerQualifiedName: string;
  callerMethod: string;
  bodyNode: AnyCstNode;
}

function methodNameOf(methodOrHeaderContainer: AnyCstNode): string | undefined {
  const headerNode = childNode(methodOrHeaderContainer.children, 'methodHeader');
  const declaratorNode =
    headerNode === undefined ? undefined : childNode(headerNode.children, 'methodDeclarator');
  return declaratorNode === undefined
    ? undefined
    : childToken(declaratorNode.children, 'Identifier')?.image;
}

function bodyOf(methodOrHeaderContainer: AnyCstNode): AnyCstNode | undefined {
  return childNode(methodOrHeaderContainer.children, 'methodBody');
}

function simpleTypeNameOf(node: AnyCstNode | undefined): string {
  const typeIdentifierNode =
    node === undefined ? undefined : childNode(node.children, 'typeIdentifier');
  return typeIdentifierNode === undefined
    ? 'Unknown'
    : (childToken(typeIdentifierNode.children, 'Identifier')?.image ?? 'Unknown');
}

function qualify(packageName: string | undefined, simpleName: string): string {
  return packageName === undefined || packageName.length === 0
    ? simpleName
    : `${packageName}.${simpleName}`;
}

function collectFromClassMemberDeclaration(
  node: AnyCstNode,
  packageName: string | undefined,
  enclosingQualifiedName: string,
  sink: MethodSite[],
): void {
  const methodNode = childNode(node.children, 'methodDeclaration');
  if (methodNode !== undefined) {
    const name = methodNameOf(methodNode);
    const body = bodyOf(methodNode);
    if (name !== undefined && body !== undefined)
      sink.push({
        callerQualifiedName: enclosingQualifiedName,
        callerMethod: name,
        bodyNode: body,
      });
  }
  const nestedClassNode = childNode(node.children, 'classDeclaration');
  if (nestedClassNode !== undefined)
    collectFromClassDeclaration(nestedClassNode, packageName, sink);
  const nestedInterfaceNode = childNode(node.children, 'interfaceDeclaration');
  if (nestedInterfaceNode !== undefined)
    collectFromInterfaceDeclaration(nestedInterfaceNode, packageName, sink);
}

function collectFromInterfaceMemberDeclaration(
  node: AnyCstNode,
  packageName: string | undefined,
  enclosingQualifiedName: string,
  sink: MethodSite[],
): void {
  const methodNode = childNode(node.children, 'interfaceMethodDeclaration');
  if (methodNode !== undefined) {
    const name = methodNameOf(methodNode);
    const body = bodyOf(methodNode);
    if (name !== undefined && body !== undefined)
      sink.push({
        callerQualifiedName: enclosingQualifiedName,
        callerMethod: name,
        bodyNode: body,
      });
  }
  const nestedClassNode = childNode(node.children, 'classDeclaration');
  if (nestedClassNode !== undefined)
    collectFromClassDeclaration(nestedClassNode, packageName, sink);
  const nestedInterfaceNode = childNode(node.children, 'interfaceDeclaration');
  if (nestedInterfaceNode !== undefined)
    collectFromInterfaceDeclaration(nestedInterfaceNode, packageName, sink);
}

function collectFromClassDeclaration(
  node: AnyCstNode,
  packageName: string | undefined,
  sink: MethodSite[],
): void {
  const normal = childNode(node.children, 'normalClassDeclaration');
  if (normal !== undefined) {
    const qualifiedName = qualify(packageName, simpleTypeNameOf(normal));
    const bodyNode = childNode(normal.children, 'classBody');
    if (bodyNode !== undefined) {
      for (const declNode of childNodes(bodyNode.children, 'classBodyDeclaration')) {
        const memberNode = childNode(declNode.children, 'classMemberDeclaration');
        if (memberNode !== undefined)
          collectFromClassMemberDeclaration(memberNode, packageName, qualifiedName, sink);
      }
    }
    return;
  }

  const enumDecl = childNode(node.children, 'enumDeclaration');
  if (enumDecl !== undefined) {
    const qualifiedName = qualify(packageName, simpleTypeNameOf(enumDecl));
    const enumBodyNode = childNode(enumDecl.children, 'enumBody');
    const declsNode =
      enumBodyNode === undefined
        ? undefined
        : childNode(enumBodyNode.children, 'enumBodyDeclarations');
    if (declsNode !== undefined) {
      for (const declNode of childNodes(declsNode.children, 'classBodyDeclaration')) {
        const memberNode = childNode(declNode.children, 'classMemberDeclaration');
        if (memberNode !== undefined)
          collectFromClassMemberDeclaration(memberNode, packageName, qualifiedName, sink);
      }
    }
    return;
  }

  const recordDecl = childNode(node.children, 'recordDeclaration');
  if (recordDecl !== undefined) {
    const qualifiedName = qualify(packageName, simpleTypeNameOf(recordDecl));
    const recordBodyNode = childNode(recordDecl.children, 'recordBody');
    if (recordBodyNode !== undefined) {
      for (const declNode of childNodes(recordBodyNode.children, 'recordBodyDeclaration')) {
        const classBodyDeclNode = childNode(declNode.children, 'classBodyDeclaration');
        const memberNode =
          classBodyDeclNode === undefined
            ? undefined
            : childNode(classBodyDeclNode.children, 'classMemberDeclaration');
        if (memberNode !== undefined)
          collectFromClassMemberDeclaration(memberNode, packageName, qualifiedName, sink);
      }
    }
  }
}

function collectFromInterfaceDeclaration(
  node: AnyCstNode,
  packageName: string | undefined,
  sink: MethodSite[],
): void {
  const normal = childNode(node.children, 'normalInterfaceDeclaration');
  if (normal === undefined) return;
  const qualifiedName = qualify(packageName, simpleTypeNameOf(normal));
  const bodyNode = childNode(normal.children, 'interfaceBody');
  if (bodyNode === undefined) return;
  for (const memberNode of childNodes(bodyNode.children, 'interfaceMemberDeclaration')) {
    collectFromInterfaceMemberDeclaration(memberNode, packageName, qualifiedName, sink);
  }
}

function collectMethodSites(root: AnyCstNode, packageName: string | undefined): MethodSite[] {
  const ordinaryUnitNode = childNode(root.children, 'ordinaryCompilationUnit');
  if (ordinaryUnitNode === undefined) return [];
  const sink: MethodSite[] = [];
  for (const typeDeclNode of childNodes(ordinaryUnitNode.children, 'typeDeclaration')) {
    const classNode = childNode(typeDeclNode.children, 'classDeclaration');
    if (classNode !== undefined) collectFromClassDeclaration(classNode, packageName, sink);
    const interfaceNode = childNode(typeDeclNode.children, 'interfaceDeclaration');
    if (interfaceNode !== undefined)
      collectFromInterfaceDeclaration(interfaceNode, packageName, sink);
  }
  return sink;
}

interface CallVisitorParam {
  callerQualifiedName: string;
  callerMethod: string;
}

interface CallVisitorOptions {
  path: string;
  source: string;
  context: FileContext;
  qualifiedNames: ReadonlySet<string>;
}

/**
 * `fqnOrRefType` (a `primaryPrefix` alternative) greedily consumes AS MUCH of
 * a dotted chain as the grammar's own ambiguity-avoidance lookahead allows --
 * for `CheckoutSupport.audit(x)`, the ENTIRE "CheckoutSupport.audit" is
 * consumed inside the prefix itself (one `fqnOrRefTypePartFirst` plus one
 * `fqnOrRefTypePartRest`), and `primarySuffix` gets only the trailing
 * `(x)` -- there is no separate `Dot Identifier` suffix to find. So the
 * prefix itself can seed MULTIPLE chain segments, not just one.
 */
function simpleCommonIdentifier(commonNode: AnyCstNode): string | undefined {
  if (childNode(commonNode.children, 'typeArguments') !== undefined) return undefined; // e.g. a method-reference-style type witness
  return childToken(commonNode.children, 'Identifier')?.image; // undefined when this part is `Super` instead
}

/** The prefix's own seed segments (`["this"]`, or every plain identifier of an `fqnOrRefType` chain), or `undefined` when the prefix is not a simple dotted-identifier chain at all. */
function simplePrefixSegments(prefixNode: AnyCstNode): string[] | undefined {
  if (childToken(prefixNode.children, 'This') !== undefined) return ['this'];

  const fqnNode = childNode(prefixNode.children, 'fqnOrRefType');
  if (fqnNode === undefined) return undefined;

  const firstNode = childNode(fqnNode.children, 'fqnOrRefTypePartFirst');
  if (firstNode === undefined || childNodes(firstNode.children, 'annotation').length > 0)
    return undefined;
  const firstCommon = childNode(firstNode.children, 'fqnOrRefTypePartCommon');
  const firstIdentifier =
    firstCommon === undefined ? undefined : simpleCommonIdentifier(firstCommon);
  if (firstIdentifier === undefined) return undefined;

  const segments = [firstIdentifier];
  for (const restNode of childNodes(fqnNode.children, 'fqnOrRefTypePartRest')) {
    if (
      childNodes(restNode.children, 'annotation').length > 0 ||
      childNode(restNode.children, 'typeArguments') !== undefined
    ) {
      return undefined;
    }
    const commonNode = childNode(restNode.children, 'fqnOrRefTypePartCommon');
    const identifier = commonNode === undefined ? undefined : simpleCommonIdentifier(commonNode);
    if (identifier === undefined) return undefined;
    segments.push(identifier);
  }
  return segments;
}

function dotIdentifierSegment(suffixNode: AnyCstNode): string | undefined {
  if (childNode(suffixNode.children, 'methodInvocationSuffix') !== undefined) return undefined;
  if (childNode(suffixNode.children, 'arrayAccessSuffix') !== undefined) return undefined;
  if (childNode(suffixNode.children, 'classLiteralSuffix') !== undefined) return undefined;
  if (childNode(suffixNode.children, 'methodReferenceSuffix') !== undefined) return undefined;
  if (childToken(suffixNode.children, 'Dot') === undefined) return undefined;
  return childToken(suffixNode.children, 'Identifier')?.image;
}

class CallGraphVisitor extends BaseJavaCstVisitorWithDefaults {
  readonly calls: JavaCallFact[] = [];
  private readonly options: CallVisitorOptions;

  constructor(options: CallVisitorOptions) {
    super();
    this.options = options;
    this.validateVisitor();
  }

  override primary(ctx: unknown, param?: CallVisitorParam): void {
    const bag = ctx as ChildBag;
    const prefixNode = childNode(bag, 'primaryPrefix');
    const suffixNodes = childNodes(bag, 'primarySuffix');

    if (prefixNode !== undefined) this.visit(prefixNode as unknown as CstNode, param);
    for (const suffixNode of suffixNodes) this.visit(suffixNode as unknown as CstNode, param);

    let segments: string[] = [];
    let chainValid = false;
    if (prefixNode !== undefined) {
      const seed = simplePrefixSegments(prefixNode);
      if (seed !== undefined) {
        segments = seed;
        chainValid = true;
      }
    }

    for (const suffixNode of suffixNodes) {
      const invocationNode = childNode(suffixNode.children, 'methodInvocationSuffix');
      if (invocationNode !== undefined) {
        if (param !== undefined) this.recordCall(param, chainValid, segments, suffixNode);
        chainValid = false;
        segments = [];
        continue;
      }

      if (!chainValid) continue;
      const segment = dotIdentifierSegment(suffixNode);
      if (segment === undefined) {
        chainValid = false;
        segments = [];
      } else {
        segments = [...segments, segment];
      }
    }
  }

  private recordCall(
    param: CallVisitorParam,
    chainValid: boolean,
    segments: string[],
    invocationSiteNode: AnyCstNode,
  ): void {
    const { path, source, context, qualifiedNames } = this.options;
    const methodName =
      chainValid && segments.length > 0 ? segments[segments.length - 1] : undefined;
    const qualifierSegments = chainValid && methodName !== undefined ? segments.slice(0, -1) : [];

    const span = spanOf(path, invocationSiteNode);
    const firstStringArgument = firstStringArgumentOf(invocationSiteNode);
    const base = {
      callerQualifiedName: param.callerQualifiedName,
      callerMethod: param.callerMethod,
      span,
      ...(firstStringArgument === undefined ? {} : { firstStringArgument }),
    };

    if (methodName === undefined) {
      this.calls.push({
        ...base,
        calleeName: sourceTextOf(invocationSiteNode, source),
        unresolved: true,
      });
      return;
    }

    if (qualifierSegments.length === 0) {
      this.calls.push({
        ...base,
        calleeName: methodName,
        calleeQualifiedName: `${param.callerQualifiedName}.${methodName}`,
        unresolved: false,
      });
      return;
    }

    if (qualifierSegments.length === 1 && qualifierSegments[0] !== undefined) {
      const qualifierSegment = qualifierSegments[0];
      if (qualifierSegment === 'this') {
        this.calls.push({
          ...base,
          calleeName: methodName,
          calleeQualifiedName: `${param.callerQualifiedName}.${methodName}`,
          unresolved: false,
        });
        return;
      }
      const resolved = resolveTypeName(qualifierSegment, context, qualifiedNames);
      if (resolved.toQualifiedName !== undefined) {
        this.calls.push({
          ...base,
          calleeName: `${qualifierSegment}.${methodName}`,
          calleeQualifiedName: `${resolved.toQualifiedName}.${methodName}`,
          unresolved: false,
        });
        return;
      }
    }

    this.calls.push({
      ...base,
      calleeName: `${qualifierSegments.join('.')}.${methodName}`,
      unresolved: true,
    });
  }
}

/** The first argument's literal value, when `methodInvocationSuffix`'s argument list starts with a plain literal (e.g. a string). */
function firstStringArgumentOf(primarySuffixNode: AnyCstNode): string | undefined {
  const invocationNode = childNode(primarySuffixNode.children, 'methodInvocationSuffix');
  const argListNode =
    invocationNode === undefined ? undefined : childNode(invocationNode.children, 'argumentList');
  const firstExpressionNode =
    argListNode === undefined ? undefined : childNodes(argListNode.children, 'expression')[0];
  if (firstExpressionNode === undefined) return undefined;
  const literal = resolveLiteral(firstExpressionNode);
  return typeof literal === 'string' ? literal : undefined;
}

function callsInFile(
  path: string,
  source: string,
  cst: CstNode,
  context: FileContext,
  qualifiedNames: ReadonlySet<string>,
): JavaCallFact[] {
  const root = asNode(cst);
  const sites = collectMethodSites(root, context.packageName);
  const visitor = new CallGraphVisitor({ path, source, context, qualifiedNames });
  for (const site of sites) {
    visitor.visit(site.bodyNode as unknown as CstNode, {
      callerQualifiedName: site.callerQualifiedName,
      callerMethod: site.callerMethod,
    });
  }
  return visitor.calls;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JavaCallGraph {
  calls: JavaCallFact[];
  typeDependencies: JavaTypeDependencyFact[];
}

function compareSpans(a: SourceSpan, b: SourceSpan): number {
  return a.path.localeCompare(b.path) || a.startLine - b.startLine;
}

/**
 * Builds the type-dependency graph (from already-computed structure facts)
 * and the call graph (a second, targeted CST walk per file) for a whole
 * parsed Java source set.
 */
export function extractJavaCallGraph(
  filesFacts: readonly JavaFileFacts[],
  cstsByPath: ReadonlyMap<string, CstNode>,
  sourcesByPath: ReadonlyMap<string, string>,
): JavaCallGraph {
  const qualifiedNames = new Set(
    filesFacts.flatMap((f) => flattenJavaTypes(f.types).map((t) => t.qualifiedName)),
  );

  const typeDependencies = filesFacts
    .flatMap((file) => typeDependenciesOf(file, buildFileContext(file), qualifiedNames))
    .sort(
      (a, b) =>
        a.fromQualifiedName.localeCompare(b.fromQualifiedName) ||
        a.relation.localeCompare(b.relation) ||
        compareSpans(a.span, b.span),
    );

  const calls = filesFacts
    .flatMap((file) => {
      const cst = cstsByPath.get(file.path);
      const source = sourcesByPath.get(file.path);
      if (cst === undefined || source === undefined) return [];
      return callsInFile(file.path, source, cst, buildFileContext(file), qualifiedNames);
    })
    .sort(
      (a, b) =>
        a.callerQualifiedName.localeCompare(b.callerQualifiedName) ||
        a.callerMethod.localeCompare(b.callerMethod) ||
        compareSpans(a.span, b.span),
    );

  return { calls, typeDependencies };
}
