# @phoenix-ai/drift-detection

**Module:** Differential / Drift Detection Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Differential / Drift Detection Engine"

## Responsibility

Diffs successive runs against a system and reports architectural drift over time.

## Status

Implemented (P8): content-addressed graph versions (`version.ts`), immutable in-memory and filesystem version stores (`store.ts`), and the drift changelog with change classification and observed/inferred separation (`diff.ts`). See `docs/phase-8/README.md`.
