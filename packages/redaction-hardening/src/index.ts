/**
 * @phoenix-ai/redaction-hardening
 * Module: Redaction & Injection Hardening (FRD §3.2)
 *
 * P8 -- the first real implementation, replacing the scaffold.
 *
 * Implemented: FR-SEC-01 (scan), FR-SEC-02 (in-place stable tokens),
 * FR-SEC-03 (encrypted, non-retaining vault), FR-SEC-04 (quarantine plus a
 * gate stamp downstream stages can enforce).
 *
 * Not applicable today, stated rather than faked: FR-SEC-05 ("content shall
 * be presented to models only within a delimited data context") and
 * FR-SEC-06 ("extraction agents ... no tool access") govern MODEL calls, and
 * no Phoenix stage calls a model -- extraction is parser-based and inference
 * is rule-based (`@phoenix-ai/inference-engine`'s `InferenceProvider` is an
 * extension point with no LLM implementation). They become binding the
 * moment one is added. FR-SEC-07 (claims validated before admission) is
 * met by the canonical validators every stage already runs, not here.
 */

export { detectSecrets, SECRET_KINDS, type Detection, type SecretKind } from './detectors.js';
export { createRedactionVault, type RedactionVault, type RedactionVaultEntry } from './vault.js';
export {
  assertRedactionGatePassed,
  hasPassedRedactionGate,
  redactArtifacts,
  redactText,
  RedactionGateBypassError,
  REDACTION_GATE_ATTRIBUTE,
  REDACTION_GATE_VERSION,
  type QuarantinedArtifact,
  type QuarantineReason,
  type RedactionFinding,
  type RedactionGateResult,
} from './gate.js';
