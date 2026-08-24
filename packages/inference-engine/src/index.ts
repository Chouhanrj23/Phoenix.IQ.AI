/**
 * @phoenix-ai/inference-engine
 * Module: Semantic Inference Engine
 *
 * Phase 5 -- Business Understanding. Interprets the OKF's already-verified
 * technical facts into business vocabulary, concepts, capabilities,
 * journeys, entity states, and business<->technical traceability -- never
 * over raw files (FR-SEM-03). See `docs/phase-5/README.md` and
 * `docs/architecture/adr/0025-phase-5-business-understanding.md`.
 */

export * from './inference-contract.js';
export * from './vocabulary.js';
export * from './concept-inference.js';
export * from './capability-inference.js';
export * from './journey-inference.js';
export * from './state-inference.js';
export * from './journey-mapping.js';
export * from './traceability.js';
