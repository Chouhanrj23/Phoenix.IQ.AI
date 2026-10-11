/**
 * @phoenix-ai/drift-detection
 * Module: Differential / Drift Detection Engine (FRD §3.9) and graph
 * versioning (FR-KG-05).
 *
 * P8 -- the first real implementation, replacing the scaffold:
 *  - `version.ts` -- content-addressed, immutable graph versions with
 *    per-element "last changed in" versions (FRD §4.3);
 *  - `store.ts` -- in-memory and filesystem version stores, per system;
 *  - `diff.ts` -- the classified architectural changelog between versions.
 */

export * from './version.js';
export * from './store.js';
export * from './diff.js';
