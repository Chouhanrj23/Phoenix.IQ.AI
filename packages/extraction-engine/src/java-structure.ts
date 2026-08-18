/**
 * P3-03 -- deterministic Java structural facts (FR-DET-01, FR-DET-08).
 *
 * Turns one parsed compilation unit into `JavaFileFacts`: package, imports,
 * and every type declaration (class/interface/enum/record/annotation-type)
 * with its modifiers, annotations, extends/implements, fields, methods, and
 * nested types -- each carrying a `SourceSpan` read straight off the CST
 * node's own `location`.
 *
 * Deliberately implemented as plain recursive-descent over the DECLARATION
 * grammar (`classDeclaration`, `fieldDeclaration`, `methodDeclaration`, ...)
 * rather than a `BaseJavaCstVisitorWithDefaults` subclass: that subset of
 * ~30 productions is small and fully enumerable by hand, so writing it as
 * ordinary functions that call each other explicitly removes the visitor
 * API's central foot-gun entirely (overriding a visitor method silently
 * disables default auto-recursion for everything below it) -- there is no
 * implicit recursion here to accidentally break. `java-calls.ts` uses the
 * real visitor API instead, specifically because expression/statement
 * nesting is NOT boundedly enumerable by hand.
 *
 * Type/expression TEXT (a field's type, an extends clause, an annotation
 * attribute's raw value) is never reconstructed from the grammar -- it is
 * sliced directly from the original source string via each node's
 * `location` (`sourceTextOf`, `cst-utils.ts`), which is simpler and more
 * exact than hand-writing a stringifier for `unannType`'s dozen sub-rules.
 */

import type { CstNode } from 'java-parser';
import {
  asNode,
  childNode,
  childNodes,
  childToken,
  childTokens,
  collectTokens,
  resolveLiteral,
  sourceTextOf,
  spanOf,
  type AnyCstNode,
  type LiteralValue,
  type SourceSpan,
} from './cst-utils.js';

export type { SourceSpan } from './cst-utils.js';

export interface JavaAnnotationAttribute {
  /** Exact source text of this attribute's value, always present. */
  raw: string;
  resolved: boolean;
  /** Present when the value is exactly one literal token. */
  value?: LiteralValue;
  /** Present when the value is an array literal whose every element resolved. */
  values?: LiteralValue[];
}

export interface JavaAnnotationFact extends SourceSpan {
  /** Simple name (last segment of a possibly-qualified `typeName`), e.g. "Entity". */
  name: string;
  /** Keyed by attribute name; a marker/single-element annotation's sole value is keyed `"value"`. */
  attributes: Record<string, JavaAnnotationAttribute>;
}

export interface JavaFieldFact extends SourceSpan {
  name: string;
  /** Source text of the declared type, e.g. "String", "List<CheckoutItem>". */
  type: string;
  modifiers: string[];
  annotations: JavaAnnotationFact[];
}

export interface JavaParameterFact {
  name: string;
  type: string;
  annotations: JavaAnnotationFact[];
}

export interface JavaMethodFact extends SourceSpan {
  name: string;
  modifiers: string[];
  annotations: JavaAnnotationFact[];
  parameters: JavaParameterFact[];
  /** Source text of the return type, or "void". */
  returnType: string;
  throwsTypes: string[];
}

export type JavaTypeKind = 'class' | 'interface' | 'enum' | 'record' | 'annotation';

export interface JavaTypeFact extends SourceSpan {
  kind: JavaTypeKind;
  packageName?: string;
  simpleName: string;
  /** `packageName + '.' + simpleName`, or just `simpleName` with no package. Does NOT account for enclosing types. */
  qualifiedName: string;
  modifiers: string[];
  annotations: JavaAnnotationFact[];
  extendsTypes: string[];
  implementsTypes: string[];
  fields: JavaFieldFact[];
  methods: JavaMethodFact[];
  nestedTypes: JavaTypeFact[];
}

export interface JavaImportFact {
  /** Dotted name as written, e.g. "org.springframework.web.bind.annotation.RestController" or "java.util.*". */
  name: string;
  isStatic: boolean;
  isWildcard: boolean;
}

export interface JavaFileFacts {
  path: string;
  packageName?: string;
  imports: JavaImportFact[];
  types: JavaTypeFact[];
}

/** Every type, plus every type nested (recursively) within it, in document order. */
export function flattenJavaTypes(types: readonly JavaTypeFact[]): JavaTypeFact[] {
  return types.flatMap((t) => [t, ...flattenJavaTypes(t.nestedTypes)]);
}

function dottedName(node: AnyCstNode): string {
  return childTokens(node.children, 'Identifier')
    .map((token) => token.image)
    .join('.');
}

function simpleNameOf(node: AnyCstNode | undefined): string {
  const typeIdentifierNode =
    node === undefined ? undefined : childNode(node.children, 'typeIdentifier');
  return typeIdentifierNode === undefined
    ? 'Unknown'
    : (childToken(typeIdentifierNode.children, 'Identifier')?.image ?? 'Unknown');
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

function findElementValueArrayInitializer(node: AnyCstNode): AnyCstNode | undefined {
  if (node.name === 'elementValueArrayInitializer') return node;
  return childNode(node.children, 'elementValueArrayInitializer');
}

function attributeFrom(source: string, node: AnyCstNode): JavaAnnotationAttribute {
  const raw = sourceTextOf(node, source);

  const literal = resolveLiteral(node);
  if (literal !== undefined) return { raw, resolved: true, value: literal };

  const arrayNode = findElementValueArrayInitializer(node);
  if (arrayNode !== undefined) {
    const listNode = childNode(arrayNode.children, 'elementValueList');
    const elementNodes =
      listNode === undefined ? [] : childNodes(listNode.children, 'elementValue');
    const values = elementNodes.map((element) => resolveLiteral(element));
    if (values.length > 0 && values.every((value): value is LiteralValue => value !== undefined)) {
      return { raw, resolved: true, values };
    }
  }

  return { raw, resolved: false };
}

function buildAnnotationFact(path: string, source: string, node: AnyCstNode): JavaAnnotationFact {
  const typeNameNode = childNode(node.children, 'typeName');
  const dotted = typeNameNode === undefined ? sourceTextOf(node, source) : dottedName(typeNameNode);
  const name = dotted.split('.').pop() ?? dotted;

  const attributes: Record<string, JavaAnnotationAttribute> = {};
  const pairListNode = childNode(node.children, 'elementValuePairList');
  if (pairListNode !== undefined) {
    for (const pairNode of childNodes(pairListNode.children, 'elementValuePair')) {
      const key = childToken(pairNode.children, 'Identifier')?.image;
      const valueNode = childNode(pairNode.children, 'elementValue');
      if (key !== undefined && valueNode !== undefined)
        attributes[key] = attributeFrom(source, valueNode);
    }
  } else {
    const singleValueNode =
      childNode(node.children, 'elementValue') ??
      childNode(node.children, 'elementValueArrayInitializer');
    if (singleValueNode !== undefined) attributes.value = attributeFrom(source, singleValueNode);
  }

  return { ...spanOf(path, node), name, attributes };
}

/** `classModifier`/`interfaceModifier`/`fieldModifier`/`methodModifier`/`constantModifier`/`variableModifier`/... all share this `OR[annotation | <keyword>]` shape. */
function collectModifiers(
  path: string,
  source: string,
  modifierNodes: AnyCstNode[],
): { modifiers: string[]; annotations: JavaAnnotationFact[] } {
  const modifiers: string[] = [];
  const annotations: JavaAnnotationFact[] = [];
  for (const modifierNode of modifierNodes) {
    const annotationNode = childNode(modifierNode.children, 'annotation');
    if (annotationNode !== undefined) {
      annotations.push(buildAnnotationFact(path, source, annotationNode));
      continue;
    }
    const token = collectTokens(modifierNode)[0];
    if (token !== undefined) modifiers.push(token.tokenType.name);
  }
  return { modifiers, annotations };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

function buildFieldFacts(
  path: string,
  source: string,
  modifierNodes: AnyCstNode[],
  unannTypeNode: AnyCstNode,
  declaratorListNode: AnyCstNode,
): JavaFieldFact[] {
  const { modifiers, annotations } = collectModifiers(path, source, modifierNodes);
  const type = sourceTextOf(unannTypeNode, source);

  return childNodes(declaratorListNode.children, 'variableDeclarator').flatMap((declaratorNode) => {
    const idNode = childNode(declaratorNode.children, 'variableDeclaratorId');
    const name =
      idNode === undefined ? undefined : childToken(idNode.children, 'Identifier')?.image;
    if (name === undefined) return [];
    return [{ ...spanOf(path, declaratorNode), name, type, modifiers, annotations }];
  });
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

function buildParameterFact(
  path: string,
  source: string,
  formalParameterNode: AnyCstNode,
): JavaParameterFact | undefined {
  const regular = childNode(formalParameterNode.children, 'variableParaRegularParameter');
  const variadic = childNode(formalParameterNode.children, 'variableArityParameter');
  const node = regular ?? variadic;
  if (node === undefined) return undefined;

  const unannTypeNode = childNode(node.children, 'unannType');
  const type = unannTypeNode === undefined ? '' : sourceTextOf(unannTypeNode, source);

  let name: string | undefined;
  let annotations: JavaAnnotationFact[] = [];
  if (regular !== undefined) {
    const idNode = childNode(regular.children, 'variableDeclaratorId');
    name = idNode === undefined ? undefined : childToken(idNode.children, 'Identifier')?.image;
    annotations = collectModifiers(
      path,
      source,
      childNodes(regular.children, 'variableModifier'),
    ).annotations;
  } else if (variadic !== undefined) {
    name = childToken(variadic.children, 'Identifier')?.image;
    annotations = childNodes(variadic.children, 'annotation').map((a) =>
      buildAnnotationFact(path, source, a),
    );
  }
  if (name === undefined) return undefined;

  return { name, type, annotations };
}

function buildMethodFact(
  path: string,
  source: string,
  span: AnyCstNode,
  modifierNodes: AnyCstNode[],
  methodHeaderNode: AnyCstNode,
): JavaMethodFact {
  const { modifiers, annotations } = collectModifiers(path, source, modifierNodes);

  const resultNode = childNode(methodHeaderNode.children, 'result');
  const returnType = resultNode === undefined ? 'void' : sourceTextOf(resultNode, source);

  const declaratorNode = childNode(methodHeaderNode.children, 'methodDeclarator');
  const name =
    declaratorNode === undefined
      ? ''
      : (childToken(declaratorNode.children, 'Identifier')?.image ?? '');
  const formalParameterListNode =
    declaratorNode === undefined
      ? undefined
      : childNode(declaratorNode.children, 'formalParameterList');
  const parameters = (
    formalParameterListNode === undefined
      ? []
      : childNodes(formalParameterListNode.children, 'formalParameter')
  )
    .map((p) => buildParameterFact(path, source, p))
    .filter((p): p is JavaParameterFact => p !== undefined);

  const throwsNode = childNode(methodHeaderNode.children, 'throws');
  const exceptionListNode =
    throwsNode === undefined ? undefined : childNode(throwsNode.children, 'exceptionTypeList');
  const throwsTypes = (
    exceptionListNode === undefined ? [] : childNodes(exceptionListNode.children, 'exceptionType')
  ).map((t) => sourceTextOf(t, source));

  return {
    ...spanOf(path, span),
    name,
    modifiers,
    annotations,
    parameters,
    returnType,
    throwsTypes,
  };
}

// ---------------------------------------------------------------------------
// Type bodies -- classBody / interfaceBody / enumBody(+enumBodyDeclarations) / recordBody
// ---------------------------------------------------------------------------

interface BodyMembers {
  fields: JavaFieldFact[];
  methods: JavaMethodFact[];
  nestedTypes: JavaTypeFact[];
}

function emptyBody(): BodyMembers {
  return { fields: [], methods: [], nestedTypes: [] };
}

function mergeBody(target: BodyMembers, addition: BodyMembers): void {
  target.fields.push(...addition.fields);
  target.methods.push(...addition.methods);
  target.nestedTypes.push(...addition.nestedTypes);
}

/** Handles one `classMemberDeclaration`-shaped node: `OR[fieldDeclaration|methodDeclaration|classDeclaration|interfaceDeclaration|Semicolon]`. */
function buildFromClassMemberDeclaration(
  path: string,
  source: string,
  packageName: string | undefined,
  node: AnyCstNode,
): BodyMembers {
  const result = emptyBody();

  const fieldNode = childNode(node.children, 'fieldDeclaration');
  if (fieldNode !== undefined) {
    const unannTypeNode = childNode(fieldNode.children, 'unannType');
    const declaratorListNode = childNode(fieldNode.children, 'variableDeclaratorList');
    if (unannTypeNode !== undefined && declaratorListNode !== undefined) {
      result.fields.push(
        ...buildFieldFacts(
          path,
          source,
          childNodes(fieldNode.children, 'fieldModifier'),
          unannTypeNode,
          declaratorListNode,
        ),
      );
    }
  }

  const methodNode = childNode(node.children, 'methodDeclaration');
  if (methodNode !== undefined) {
    const headerNode = childNode(methodNode.children, 'methodHeader');
    if (headerNode !== undefined) {
      result.methods.push(
        buildMethodFact(
          path,
          source,
          methodNode,
          childNodes(methodNode.children, 'methodModifier'),
          headerNode,
        ),
      );
    }
  }

  const nestedClassNode = childNode(node.children, 'classDeclaration');
  if (nestedClassNode !== undefined)
    result.nestedTypes.push(buildClassDeclaration(path, source, packageName, nestedClassNode));

  const nestedInterfaceNode = childNode(node.children, 'interfaceDeclaration');
  if (nestedInterfaceNode !== undefined) {
    result.nestedTypes.push(
      buildInterfaceDeclaration(path, source, packageName, nestedInterfaceNode),
    );
  }

  return result;
}

/** Handles one `interfaceMemberDeclaration`-shaped node: `OR[constantDeclaration|interfaceMethodDeclaration|classDeclaration|interfaceDeclaration|Semicolon]`. */
function buildFromInterfaceMemberDeclaration(
  path: string,
  source: string,
  packageName: string | undefined,
  node: AnyCstNode,
): BodyMembers {
  const result = emptyBody();

  const constantNode = childNode(node.children, 'constantDeclaration');
  if (constantNode !== undefined) {
    const unannTypeNode = childNode(constantNode.children, 'unannType');
    const declaratorListNode = childNode(constantNode.children, 'variableDeclaratorList');
    if (unannTypeNode !== undefined && declaratorListNode !== undefined) {
      result.fields.push(
        ...buildFieldFacts(
          path,
          source,
          childNodes(constantNode.children, 'constantModifier'),
          unannTypeNode,
          declaratorListNode,
        ),
      );
    }
  }

  const methodNode = childNode(node.children, 'interfaceMethodDeclaration');
  if (methodNode !== undefined) {
    const headerNode = childNode(methodNode.children, 'methodHeader');
    if (headerNode !== undefined) {
      result.methods.push(
        buildMethodFact(
          path,
          source,
          methodNode,
          childNodes(methodNode.children, 'interfaceMethodModifier'),
          headerNode,
        ),
      );
    }
  }

  const nestedClassNode = childNode(node.children, 'classDeclaration');
  if (nestedClassNode !== undefined)
    result.nestedTypes.push(buildClassDeclaration(path, source, packageName, nestedClassNode));

  const nestedInterfaceNode = childNode(node.children, 'interfaceDeclaration');
  if (nestedInterfaceNode !== undefined) {
    result.nestedTypes.push(
      buildInterfaceDeclaration(path, source, packageName, nestedInterfaceNode),
    );
  }

  return result;
}

function buildClassBody(
  path: string,
  source: string,
  packageName: string | undefined,
  classBodyNode: AnyCstNode,
): BodyMembers {
  const result = emptyBody();
  for (const declNode of childNodes(classBodyNode.children, 'classBodyDeclaration')) {
    const memberNode = childNode(declNode.children, 'classMemberDeclaration');
    if (memberNode !== undefined)
      mergeBody(result, buildFromClassMemberDeclaration(path, source, packageName, memberNode));
    // instanceInitializer / staticInitializer / constructorDeclaration: deliberately not modeled as facts (out of scope).
  }
  return result;
}

function buildInterfaceBody(
  path: string,
  source: string,
  packageName: string | undefined,
  interfaceBodyNode: AnyCstNode,
): BodyMembers {
  const result = emptyBody();
  for (const memberNode of childNodes(interfaceBodyNode.children, 'interfaceMemberDeclaration')) {
    mergeBody(result, buildFromInterfaceMemberDeclaration(path, source, packageName, memberNode));
  }
  return result;
}

function buildEnumBody(
  path: string,
  source: string,
  packageName: string | undefined,
  enumBodyNode: AnyCstNode,
): BodyMembers {
  const result = emptyBody();
  const bodyDeclarationsNode = childNode(enumBodyNode.children, 'enumBodyDeclarations');
  if (bodyDeclarationsNode === undefined) return result;
  for (const declNode of childNodes(bodyDeclarationsNode.children, 'classBodyDeclaration')) {
    const memberNode = childNode(declNode.children, 'classMemberDeclaration');
    if (memberNode !== undefined)
      mergeBody(result, buildFromClassMemberDeclaration(path, source, packageName, memberNode));
  }
  return result;
}

function buildRecordBody(
  path: string,
  source: string,
  packageName: string | undefined,
  recordBodyNode: AnyCstNode,
): BodyMembers {
  const result = emptyBody();
  for (const declNode of childNodes(recordBodyNode.children, 'recordBodyDeclaration')) {
    const classBodyDeclNode = childNode(declNode.children, 'classBodyDeclaration');
    if (classBodyDeclNode === undefined) continue; // the other alt is compactConstructorDeclaration -- out of scope.
    const memberNode = childNode(classBodyDeclNode.children, 'classMemberDeclaration');
    if (memberNode !== undefined)
      mergeBody(result, buildFromClassMemberDeclaration(path, source, packageName, memberNode));
  }
  return result;
}

function typeList(node: AnyCstNode | undefined, childKey: string, source: string): string[] {
  if (node === undefined) return [];
  return childNodes(node.children, childKey).map((t) => sourceTextOf(t, source));
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

/** Common envelope fields every `JavaTypeFact` shares, with `packageName` included only when defined (`exactOptionalPropertyTypes`). */
function typeFactEnvelope(
  path: string,
  span: AnyCstNode,
  kind: JavaTypeKind,
  packageName: string | undefined,
  simpleName: string,
  modifiers: string[],
  annotations: JavaAnnotationFact[],
  extendsTypes: string[],
  implementsTypes: string[],
): Omit<JavaTypeFact, 'fields' | 'methods' | 'nestedTypes'> {
  const qualifiedName =
    packageName === undefined || packageName.length === 0
      ? simpleName
      : `${packageName}.${simpleName}`;
  return {
    ...spanOf(path, span),
    kind,
    ...(packageName === undefined ? {} : { packageName }),
    simpleName,
    qualifiedName,
    modifiers,
    annotations,
    extendsTypes,
    implementsTypes,
  };
}

function buildClassDeclaration(
  path: string,
  source: string,
  packageName: string | undefined,
  node: AnyCstNode,
): JavaTypeFact {
  const { modifiers, annotations } = collectModifiers(
    path,
    source,
    childNodes(node.children, 'classModifier'),
  );

  const normal = childNode(node.children, 'normalClassDeclaration');
  if (normal !== undefined)
    return buildNormalClass(path, source, packageName, node, normal, modifiers, annotations);

  const enumDecl = childNode(node.children, 'enumDeclaration');
  if (enumDecl !== undefined)
    return buildEnum(path, source, packageName, node, enumDecl, modifiers, annotations);

  const recordDecl = childNode(node.children, 'recordDeclaration');
  if (recordDecl !== undefined)
    return buildRecord(path, source, packageName, node, recordDecl, modifiers, annotations);

  return {
    ...typeFactEnvelope(
      path,
      node,
      'class',
      packageName,
      'Unknown',
      modifiers,
      annotations,
      [],
      [],
    ),
    fields: [],
    methods: [],
    nestedTypes: [],
  };
}

function buildNormalClass(
  path: string,
  source: string,
  packageName: string | undefined,
  span: AnyCstNode,
  node: AnyCstNode,
  modifiers: string[],
  annotations: JavaAnnotationFact[],
): JavaTypeFact {
  const simpleName = simpleNameOf(node);

  const extendsNode = childNode(node.children, 'classExtends');
  const extendsTypeNode =
    extendsNode === undefined ? undefined : childNode(extendsNode.children, 'classType');
  const extendsTypes = extendsTypeNode === undefined ? [] : [sourceTextOf(extendsTypeNode, source)];

  const implementsNode = childNode(node.children, 'classImplements');
  const interfaceListNode =
    implementsNode === undefined
      ? undefined
      : childNode(implementsNode.children, 'interfaceTypeList');
  const implementsTypes = typeList(interfaceListNode, 'interfaceType', source);

  const bodyNode = childNode(node.children, 'classBody');
  const body =
    bodyNode === undefined ? emptyBody() : buildClassBody(path, source, packageName, bodyNode);

  return {
    ...typeFactEnvelope(
      path,
      span,
      'class',
      packageName,
      simpleName,
      modifiers,
      annotations,
      extendsTypes,
      implementsTypes,
    ),
    ...body,
  };
}

function buildEnum(
  path: string,
  source: string,
  packageName: string | undefined,
  span: AnyCstNode,
  node: AnyCstNode,
  modifiers: string[],
  annotations: JavaAnnotationFact[],
): JavaTypeFact {
  const simpleName = simpleNameOf(node);

  const implementsNode = childNode(node.children, 'classImplements');
  const interfaceListNode =
    implementsNode === undefined
      ? undefined
      : childNode(implementsNode.children, 'interfaceTypeList');
  const implementsTypes = typeList(interfaceListNode, 'interfaceType', source);

  const bodyNode = childNode(node.children, 'enumBody');
  const body =
    bodyNode === undefined ? emptyBody() : buildEnumBody(path, source, packageName, bodyNode);

  return {
    ...typeFactEnvelope(
      path,
      span,
      'enum',
      packageName,
      simpleName,
      modifiers,
      annotations,
      [],
      implementsTypes,
    ),
    ...body,
  };
}

function buildRecord(
  path: string,
  source: string,
  packageName: string | undefined,
  span: AnyCstNode,
  node: AnyCstNode,
  modifiers: string[],
  annotations: JavaAnnotationFact[],
): JavaTypeFact {
  const simpleName = simpleNameOf(node);

  const implementsNode = childNode(node.children, 'classImplements');
  const interfaceListNode =
    implementsNode === undefined
      ? undefined
      : childNode(implementsNode.children, 'interfaceTypeList');
  const implementsTypes = typeList(interfaceListNode, 'interfaceType', source);

  const headerNode = childNode(node.children, 'recordHeader');
  const componentListNode =
    headerNode === undefined ? undefined : childNode(headerNode.children, 'recordComponentList');
  const components: JavaFieldFact[] = (
    componentListNode === undefined ? [] : childNodes(componentListNode.children, 'recordComponent')
  ).flatMap((componentNode) => {
    const unannTypeNode = childNode(componentNode.children, 'unannType');
    const name = childToken(componentNode.children, 'Identifier')?.image;
    if (unannTypeNode === undefined || name === undefined) return [];
    return [
      {
        ...spanOf(path, componentNode),
        name,
        type: sourceTextOf(unannTypeNode, source),
        modifiers: [],
        annotations: [],
      },
    ];
  });

  const bodyNode = childNode(node.children, 'recordBody');
  const body =
    bodyNode === undefined ? emptyBody() : buildRecordBody(path, source, packageName, bodyNode);

  return {
    ...typeFactEnvelope(
      path,
      span,
      'record',
      packageName,
      simpleName,
      modifiers,
      annotations,
      [],
      implementsTypes,
    ),
    fields: [...components, ...body.fields],
    methods: body.methods,
    nestedTypes: body.nestedTypes,
  };
}

function buildInterfaceDeclaration(
  path: string,
  source: string,
  packageName: string | undefined,
  node: AnyCstNode,
): JavaTypeFact {
  const { modifiers, annotations } = collectModifiers(
    path,
    source,
    childNodes(node.children, 'interfaceModifier'),
  );

  const normal = childNode(node.children, 'normalInterfaceDeclaration');
  if (normal !== undefined) {
    const simpleName = simpleNameOf(normal);

    const extendsNode = childNode(normal.children, 'interfaceExtends');
    const extendsListNode =
      extendsNode === undefined ? undefined : childNode(extendsNode.children, 'interfaceTypeList');
    const extendsTypes = typeList(extendsListNode, 'interfaceType', source);

    const bodyNode = childNode(normal.children, 'interfaceBody');
    const body =
      bodyNode === undefined
        ? emptyBody()
        : buildInterfaceBody(path, source, packageName, bodyNode);

    return {
      ...typeFactEnvelope(
        path,
        node,
        'interface',
        packageName,
        simpleName,
        modifiers,
        annotations,
        extendsTypes,
        [],
      ),
      ...body,
    };
  }

  const annotationInterface = childNode(node.children, 'annotationInterfaceDeclaration');
  const simpleName = simpleNameOf(annotationInterface);

  return {
    ...typeFactEnvelope(
      path,
      node,
      'annotation',
      packageName,
      simpleName,
      modifiers,
      annotations,
      [],
      [],
    ),
    fields: [],
    methods: [],
    nestedTypes: [],
  };
}

// ---------------------------------------------------------------------------
// Compilation unit
// ---------------------------------------------------------------------------

function buildImportFact(node: AnyCstNode): JavaImportFact | undefined {
  const packageOrTypeNameNode = childNode(node.children, 'packageOrTypeName');
  if (packageOrTypeNameNode === undefined) return undefined; // emptyStatement alt (a stray ';')
  const isStatic = childToken(node.children, 'Static') !== undefined;
  const isWildcard = childToken(node.children, 'Star') !== undefined;
  const base = dottedName(packageOrTypeNameNode);
  return { name: isWildcard ? `${base}.*` : base, isStatic, isWildcard };
}

/** Extracts every deterministic structural fact from one already-parsed compilation unit. */
export function extractJavaStructure(path: string, source: string, cst: CstNode): JavaFileFacts {
  const root = asNode(cst);
  const ordinaryUnitNode = childNode(root.children, 'ordinaryCompilationUnit');
  if (ordinaryUnitNode === undefined) return { path, imports: [], types: [] };

  const packageDeclarationNode = childNode(ordinaryUnitNode.children, 'packageDeclaration');
  const packageName =
    packageDeclarationNode === undefined
      ? undefined
      : childTokens(packageDeclarationNode.children, 'Identifier')
          .map((t) => t.image)
          .join('.');

  const imports = childNodes(ordinaryUnitNode.children, 'importDeclaration')
    .map(buildImportFact)
    .filter((i): i is JavaImportFact => i !== undefined);

  const types = childNodes(ordinaryUnitNode.children, 'typeDeclaration').flatMap((typeDeclNode) => {
    const classNode = childNode(typeDeclNode.children, 'classDeclaration');
    if (classNode !== undefined)
      return [buildClassDeclaration(path, source, packageName, classNode)];
    const interfaceNode = childNode(typeDeclNode.children, 'interfaceDeclaration');
    if (interfaceNode !== undefined)
      return [buildInterfaceDeclaration(path, source, packageName, interfaceNode)];
    return [];
  });

  return { path, ...(packageName === undefined ? {} : { packageName }), imports, types };
}
