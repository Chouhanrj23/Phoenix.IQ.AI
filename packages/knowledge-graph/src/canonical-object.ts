import type { GraphElementMetadata } from '@phoenix-ai/shared';
import type { KnowledgeObjectIdentity, KnowledgeValue } from './identity.js';
import type { Evidence } from './evidence.js';
import type { LifecycleState, StructuralCategory } from './ontology.js';
import type { ConfidenceDetail } from './confidence.js';

/**
 * The canonical, domain-neutral representation of a single piece of Phoenix
 * knowledge -- a container, a domain, an integration, a persona, and so on.
 * This is the "Core knowledge" layer's envelope, not the facts themselves.
 *
 * `kind` is an open string -- the closed vocabulary of specific kinds
 * (Container, Aggregate, Persona, Integration, ...) is P2-03 through
 * P2-06's job. `category` (P2-02, `ontology.ts`) is the small, closed,
 * UNIVERSAL classification every `kind` falls under regardless of domain --
 * see `docs/architecture/adr/0004-domain-neutral-ontology.md`.
 *
 * Generic over `TAttributes` (P2-03) so a domain area can narrow
 * `attributes` to a real, compile-time-checked shape (see
 * `architecture.ts`'s `SystemObject`/`ContainerObject`/`ComponentObject`)
 * instead of the untyped default bag -- without changing this envelope or
 * any existing bare `CanonicalKnowledgeObject` usage, which keeps working
 * unchanged via the default type parameter.
 */
export interface CanonicalKnowledgeObject<
  TAttributes extends Record<string, KnowledgeValue> = Record<string, KnowledgeValue>,
> {
  /** Identifiers, timestamps, schema version -- the "Metadata" layer. */
  identity: KnowledgeObjectIdentity;
  /** Universal structural role (P2-02) -- see `StructuralCategory`. */
  category: StructuralCategory;
  /** Open-vocabulary domain-specific classification (P2-03 onward). */
  kind: string;
  /** Human-readable display name -- every Phase 1 UI concept already has one. */
  label: string;
  /**
   * Free-form, domain-neutral fact bag by default -- the "Core knowledge"
   * layer. Domain areas narrow this via `TAttributes` (P2-03 onward).
   */
  attributes: TAttributes;
  /** Provenance + confidence -- the "Source/provenance" and "Confidence" layers. */
  metadata: GraphElementMetadata;
  /** Concrete supporting material -- the "Evidence" layer. May be empty. */
  evidence: Evidence[];
  /** State tracking, where appropriate (P2-02) -- most `entity` objects won't need one. */
  lifecycle?: LifecycleState;
  /**
   * Fact/directly-observed vs derived/inferred, plus optional score
   * calculation metadata (P2-08) -- a sibling to `metadata.confidence`
   * (`@phoenix-ai/shared`, untouched), not a replacement for it. Optional
   * so P2-01 through P2-07 objects remain valid unchanged; see
   * `confidence.ts` for why `basis` is required once this is present at all.
   */
  confidenceDetail?: ConfidenceDetail;
}
