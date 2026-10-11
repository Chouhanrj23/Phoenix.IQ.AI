/**
 * @phoenix-ai/okf-renderers
 * Module: OKF Renderers (FRD §3.7)
 *
 * P7-05 "Documentation/OKF synchronisation" -- the first real implementation
 * of this module, replacing its scaffold. Scoped deliberately to what Phase 7
 * needs: keeping OKF output honest after a human correction.
 *
 *   - `OKF_ARTIFACTS` / `artifactsForObjectKind` -- which of the eleven FRD
 *     output artifact types each canonical object kind feeds, so a correction
 *     regenerates only the artifacts it actually affects.
 *   - `okfRegenerationState` -- whether a document in hand is stale, which
 *     decisions made it stale, and which artifacts need re-rendering. Phoenix
 *     has no orchestrator, so regeneration is explicit and its state is
 *     visible rather than assumed.
 *   - `regenerateOkfDocument` -- the explicit operation itself.
 *
 * (Phase 7 note, superseded in P8:) NOT implemented here originally: the eleven renderers themselves
 * (turning a bundle into each human-readable artifact). Nothing in Phase 7
 * needs them, and writing eleven renderers to satisfy a correction-propagation
 * requirement would be scope this ticket does not have. The registry records
 * which artifacts exist and which are not yet modelled at all.
 */

export {
  artifactsForObjectKind,
  okfArtifact,
  OKF_ARTIFACT_IDS,
  OKF_ARTIFACTS,
  type OkfArtifactDefinition,
  type OkfArtifactId,
} from './artifacts.js';

export {
  affectedArtifacts,
  affectedByDecisions,
  okfRegenerationState,
  regenerateOkfDocument,
  type AffectedObject,
  type OkfRegenerationResult,
  type OkfRegenerationState,
} from './regenerate.js';

// P8 -- the eleven renderers (FR-OKF-01..12) and the portable export (FR-OKF-13 / FR-IF-03).
export { ARTIFACT_INPUTS, renderAllArtifacts, renderArtifact } from './renderers.js';
export {
  BundleView,
  type ArtifactStatus,
  type ElementTrace,
  type EvidenceTrace,
  type RenderedArtifact,
  type RenderedFile,
} from './render-support.js';
export { exportOkfPackage, type ExportManifest, type ExportPackage } from './export.js';
