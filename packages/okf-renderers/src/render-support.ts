/**
 * P8 -- shared machinery for the eleven OKF renderers (FR-OKF-01..13).
 *
 * Renderers READ the canonical bundle; they never analyse source, call a
 * model, or fill a gap with a plausible guess. Everything a renderer prints
 * is either a value from the bundle or a fixed sentence saying that the
 * bundle has no value for it.
 *
 * FR-OKF-12 (per-element provenance): every element a renderer includes is
 * recorded as an `ElementTrace` -- basis (observed vs. inferred), confidence
 * and every evidence locator -- and each human-readable line carries the
 * same information inline, so a reader never has to trust an unlabelled
 * statement.
 */

import type {
  CanonicalKnowledgeBundle,
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';
import type { OkfArtifactId } from './artifacts.js';

/**
 * `rendered`    -- the bundle had at least one element for this artifact.
 * `empty`       -- the artifact is modelled, but this run found nothing for it.
 * `unavailable` -- no extractor produces this artifact's inputs yet.
 */
export type ArtifactStatus = 'rendered' | 'empty' | 'unavailable';

export interface RenderedFile {
  /** Relative, forward-slash path inside the artifact (or the export package). */
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
}

export interface EvidenceTrace {
  readonly sourceId: string;
  readonly locator?: string;
  readonly sourceVersion?: string;
}

export interface ElementTrace {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  /** `observed` = extracted from source; `derived` = inferred, pending review. */
  readonly basis: 'observed' | 'derived';
  readonly confidence: string;
  readonly score?: number;
  readonly evidence: readonly EvidenceTrace[];
}

export interface RenderedArtifact {
  readonly id: OkfArtifactId;
  readonly label: string;
  readonly status: ArtifactStatus;
  readonly files: readonly RenderedFile[];
  /** Every bundle element this artifact shows, with its provenance. */
  readonly elements: readonly ElementTrace[];
  /**
   * When `empty` or partially covered: the inputs that would let Phoenix
   * produce it. Consumed by the gap-analysis planner (FR-GAP-02).
   */
  readonly missingInputs: readonly string[];
  readonly notes: readonly string[];
}

/** Read-only indexes over one bundle, built once and shared by every renderer. */
export class BundleView {
  readonly bundle: CanonicalKnowledgeBundle;
  private readonly byId: Map<string, CanonicalKnowledgeObject>;
  private readonly outgoing = new Map<string, CanonicalKnowledgeRelationship[]>();
  private readonly incoming = new Map<string, CanonicalKnowledgeRelationship[]>();

  constructor(bundle: CanonicalKnowledgeBundle) {
    this.bundle = bundle;
    this.byId = new Map(bundle.objects.map((o) => [o.identity.id, o]));
    const relationships = [...bundle.relationships].sort((a, b) => compareCodeUnits(a.id, b.id));
    for (const r of relationships) {
      this.outgoing.set(r.sourceObjectId, [...(this.outgoing.get(r.sourceObjectId) ?? []), r]);
      this.incoming.set(r.targetObjectId, [...(this.incoming.get(r.targetObjectId) ?? []), r]);
    }
  }

  object(id: string): CanonicalKnowledgeObject | undefined {
    return this.byId.get(id);
  }

  /** Objects of the given kinds, ordered by label then id (deterministic, locale-free). */
  ofKind(...kinds: string[]): CanonicalKnowledgeObject[] {
    return this.bundle.objects.filter((o) => kinds.includes(o.kind)).sort(byLabelThenId);
  }

  /** Relationships of `kind` leaving `id`, with their resolved targets. */
  out(
    id: string,
    kind: string,
  ): { relationship: CanonicalKnowledgeRelationship; target: CanonicalKnowledgeObject }[] {
    return (this.outgoing.get(id) ?? [])
      .filter((r) => r.kind === kind)
      .flatMap((relationship) => {
        const target = this.byId.get(relationship.targetObjectId);
        return target === undefined ? [] : [{ relationship, target }];
      });
  }

  /** Relationships of `kind` arriving at `id`, with their resolved sources. */
  in(
    id: string,
    kind: string,
  ): { relationship: CanonicalKnowledgeRelationship; source: CanonicalKnowledgeObject }[] {
    return (this.incoming.get(id) ?? [])
      .filter((r) => r.kind === kind)
      .flatMap((relationship) => {
        const source = this.byId.get(relationship.sourceObjectId);
        return source === undefined ? [] : [{ relationship, source }];
      });
  }
}

export function byLabelThenId(a: CanonicalKnowledgeObject, b: CanonicalKnowledgeObject): number {
  return compareCodeUnits(a.label, b.label) || compareCodeUnits(a.identity.id, b.identity.id);
}

export function basisOf(object: CanonicalKnowledgeObject): 'observed' | 'derived' {
  return object.confidenceDetail?.basis === 'derived' ? 'derived' : 'observed';
}

export function traceOf(object: CanonicalKnowledgeObject): ElementTrace {
  const { level, score } = object.metadata.confidence;
  return {
    id: object.identity.id,
    kind: object.kind,
    label: object.label,
    basis: basisOf(object),
    confidence: level,
    ...(score === undefined ? {} : { score }),
    evidence: object.evidence.map((e) => ({
      sourceId: e.sourceId,
      ...(e.locator === undefined ? {} : { locator: e.locator }),
      ...(e.sourceVersion === undefined ? {} : { sourceVersion: e.sourceVersion }),
    })),
  };
}

/** One-line provenance for human-readable output, e.g. "observed · high · Order.java#L8-L16". */
export function provenanceLine(object: CanonicalKnowledgeObject): string {
  const { level, score } = object.metadata.confidence;
  const basis = basisOf(object) === 'derived' ? '**inferred — pending review**' : 'observed';
  const confidence = score === undefined ? level : `${level} (${score})`;
  const locators = object.evidence.map((e) => e.locator ?? e.sourceId);
  const evidence = locators.length === 0 ? 'no evidence recorded' : locators.join(', ');
  return `${basis} · confidence ${confidence} · evidence: ${evidence}`;
}

export function stringAttribute(object: CanonicalKnowledgeObject, key: string): string | undefined {
  const value = object.attributes[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function arrayAttribute<T>(object: CanonicalKnowledgeObject, key: string): T[] {
  const value = object.attributes[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Markdown table cell: no pipes or newlines may break the row. */
export function cell(text: string | number | boolean | undefined): string {
  if (text === undefined || text === '') return '—';
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Mermaid node label (inside `["…"]`). */
export function mermaidLabel(text: string): string {
  return text.replace(/"/g, '#quot;').replace(/\r?\n/g, ' ');
}

/** Stable short mermaid/DSL identifiers, assigned in first-use order. */
export class IdAllocator {
  private readonly ids = new Map<string, string>();
  constructor(private readonly prefix: string) {}
  get(key: string): string {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = `${this.prefix}${this.ids.size + 1}`;
      this.ids.set(key, id);
    }
    return id;
  }
}

export function markdown(path: string, lines: readonly string[]): RenderedFile {
  return {
    path,
    mediaType: 'text/markdown',
    content: `${lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`,
  };
}

export function header(title: string, view: BundleView, summary: string): string[] {
  return [
    `# ${title}`,
    '',
    `> System \`${view.bundle.systemId}\` · knowledge generated ${view.bundle.generatedAt} · rendered from the Phoenix knowledge graph.`,
    `> ${summary}`,
    '> Each element states whether it was **observed** in source or **inferred** (pending review), its confidence, and the evidence it rests on.',
    '',
  ];
}
