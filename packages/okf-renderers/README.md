# @phoenix-ai/okf-renderers

**Module:** OKF Renderers
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "OKF Renderers"

## Responsibility

Project the knowledge graph into the eleven OKF output artifact types. Renderers read the graph; they do not perform independent analysis.

## Status

Implemented: the artifact registry and correction-driven regeneration (P7-05), and in P8 the eleven renderers (`renderers.ts`) with per-element provenance (`trace.json`) and the portable export package (`export.ts`). Screens and NFRs are rendered as `unavailable` because no extractor produces their inputs. See `docs/phase-8/README.md`.
