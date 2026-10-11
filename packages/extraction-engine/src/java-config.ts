/**
 * P3-03 -- application configuration and environment information.
 *
 * Three sources, unified into one fact model:
 *
 *  - `extractPropertiesConfig` -- `application.properties`, a trivial
 *    line-based `key=value` format. No dependency needed.
 *  - `extractYamlConfig` -- `application.yml`/`application-*.yml`, via the
 *    `yaml` package's `parseDocument` (NOT the plain `parse`) specifically
 *    because `parseDocument` preserves each node's source `range`, which is
 *    what recovers a line number per key -- a plain `parse()` loses position
 *    entirely. Nested keys are flattened with `.` (Spring Boot's own
 *    relaxed-binding convention), and list items with `[index]`.
 *  - `extractConfigReferences` -- cross-references already-computed
 *    structural facts (`@Value("${key:default}")`, `@ConfigurationProperties
 *    (prefix=...)`) and call facts (`System.getenv("KEY")`/
 *    `System.getProperty("key")`) to say WHERE in the source a configuration
 *    key or environment variable is actually consumed -- the one module in
 *    this package that reads more than one other pass's output.
 */

import { LineCounter, isMap, isPair, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node as YamlNode } from 'yaml';
import {
  flattenJavaTypes,
  type JavaFileFacts,
  type JavaAnnotationFact,
  type SourceSpan,
} from './java-structure.js';
import type { JavaCallFact } from './java-calls.js';
import type { FactProvenance } from './fact-provenance.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

export interface JavaConfigFact {
  path: string;
  line: number;
  key: string;
  value: string;
  /** Stamped by `extractJavaProject`'s P3-10 enrichment -- see `SourceSpan.provenance`'s doc comment (`cst-utils.ts`). */
  provenance?: FactProvenance;
}

export type JavaConfigReferenceKind =
  'value-annotation' | 'configuration-properties' | 'system-getenv' | 'system-getproperty';

export interface JavaConfigReferenceFact extends SourceSpan {
  kind: JavaConfigReferenceKind;
  key?: string;
  defaultValue?: string;
  prefix?: string;
}

// ---------------------------------------------------------------------------
// application.properties
// ---------------------------------------------------------------------------

/** Parses `key=value` (or `key:value`) lines. No line-continuation (`\`) support -- a documented, minor gap. */
export function extractPropertiesConfig(path: string, content: string): JavaConfigFact[] {
  const facts: JavaConfigFact[] = [];
  const lines = content.split(/\r\n|\r|\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('!')) return;
    const separatorIndex = line.search(/[=:]/);
    if (separatorIndex === -1) return;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length === 0) return;
    facts.push({ path, line: index + 1, key, value });
  });
  return facts;
}

// ---------------------------------------------------------------------------
// application.yml
// ---------------------------------------------------------------------------

function scalarText(node: YamlNode): string {
  if (isScalar(node))
    return node.value === null || node.value === undefined ? '' : String(node.value);
  return '';
}

function walkYamlNode(
  node: YamlNode | null | undefined,
  keyPath: string,
  path: string,
  lineCounter: LineCounter,
  sink: JavaConfigFact[],
): void {
  if (node === null || node === undefined) return;

  if (isMap(node)) {
    for (const item of node.items) {
      if (!isPair(item)) continue;
      const keyNode = item.key as YamlNode | null;
      const keyText = keyNode === null ? '' : scalarText(keyNode);
      const nextPath = keyPath.length === 0 ? keyText : `${keyPath}.${keyText}`;
      walkYamlNode(item.value as YamlNode | null, nextPath, path, lineCounter, sink);
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((child, index) => {
      walkYamlNode(child as YamlNode | null, `${keyPath}[${index}]`, path, lineCounter, sink);
    });
    return;
  }

  if (isScalar(node)) {
    const offset = node.range?.[0] ?? 0;
    const line = lineCounter.linePos(offset).line;
    sink.push({ path, line, key: keyPath, value: scalarText(node) });
  }
}

/** Flattens `application.yml`/`application-*.yml` into dotted key/value facts, each with the line its key appears on. */
export function extractYamlConfig(path: string, content: string): JavaConfigFact[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(content, { lineCounter });
  const facts: JavaConfigFact[] = [];
  walkYamlNode(document.contents as YamlNode | null, '', path, lineCounter, facts);
  return facts.sort((a, b) => a.line - b.line || compareCodeUnits(a.key, b.key));
}

// ---------------------------------------------------------------------------
// Cross-references: @Value / @ConfigurationProperties / System.getenv / System.getProperty
// ---------------------------------------------------------------------------

const VALUE_PLACEHOLDER_PATTERN = /^\$\{([^:}]+)(?::(.*))?\}$/;

function referenceFromValueAnnotation(
  annotation: JavaAnnotationFact,
): JavaConfigReferenceFact | undefined {
  const raw = annotation.attributes.value?.value;
  if (typeof raw !== 'string') return undefined;
  const match = VALUE_PLACEHOLDER_PATTERN.exec(raw);
  if (match === undefined || match === null) return undefined;
  const [, key, defaultValue] = match;
  if (key === undefined) return undefined;
  return {
    ...spanFrom(annotation),
    kind: 'value-annotation',
    key,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function referenceFromConfigurationProperties(
  annotation: JavaAnnotationFact,
): JavaConfigReferenceFact | undefined {
  const prefix = annotation.attributes.value?.value ?? annotation.attributes.prefix?.value;
  if (typeof prefix !== 'string') return undefined;
  return { ...spanFrom(annotation), kind: 'configuration-properties', prefix };
}

function spanFrom(annotation: JavaAnnotationFact): SourceSpan {
  return {
    path: annotation.path,
    startLine: annotation.startLine,
    ...(annotation.endLine === undefined ? {} : { endLine: annotation.endLine }),
  };
}

function referencesFromCalls(calls: readonly JavaCallFact[]): JavaConfigReferenceFact[] {
  return calls.flatMap((call) => {
    const kind: JavaConfigReferenceKind | undefined =
      call.calleeName === 'System.getenv' || call.calleeQualifiedName?.endsWith('.getenv') === true
        ? 'system-getenv'
        : call.calleeName === 'System.getProperty' ||
            call.calleeQualifiedName?.endsWith('.getProperty') === true
          ? 'system-getproperty'
          : undefined;
    if (kind === undefined) return [];
    return [
      {
        ...call.span,
        kind,
        ...(call.firstStringArgument === undefined ? {} : { key: call.firstStringArgument }),
      },
    ];
  });
}

/** Cross-references structural and call facts to say WHERE a configuration key or environment variable is consumed. */
export function extractConfigReferences(
  filesFacts: readonly JavaFileFacts[],
  calls: readonly JavaCallFact[],
): JavaConfigReferenceFact[] {
  const references: JavaConfigReferenceFact[] = [];

  for (const file of filesFacts) {
    for (const type of flattenJavaTypes(file.types)) {
      for (const annotation of type.annotations) {
        if (annotation.name !== 'ConfigurationProperties') continue;
        const reference = referenceFromConfigurationProperties(annotation);
        if (reference !== undefined) references.push(reference);
      }
      for (const field of type.fields) {
        for (const annotation of field.annotations) {
          if (annotation.name !== 'Value') continue;
          const reference = referenceFromValueAnnotation(annotation);
          if (reference !== undefined) references.push(reference);
        }
      }
      for (const method of type.methods) {
        for (const parameter of method.parameters) {
          for (const annotation of parameter.annotations) {
            if (annotation.name !== 'Value') continue;
            const reference = referenceFromValueAnnotation(annotation);
            if (reference !== undefined) references.push(reference);
          }
        }
      }
    }
  }

  references.push(...referencesFromCalls(calls));

  return references.sort((a, b) => compareCodeUnits(a.path, b.path) || a.startLine - b.startLine);
}
