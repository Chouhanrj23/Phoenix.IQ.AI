# @phoenix-ai/evaluation-harness

**Module:** Evaluation Harness
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Evaluation Harness"

## Responsibility

Scores pipeline runs against a golden/validated system and gates regressions.

## Status

Implemented (P8): a hand-authored golden system (`src/golden/shop-platform.ts`), precision/recall for nodes, typed edges, API operations and tables, a pairwise clustering F1, round-trip verification of claims against their cited source, and the CI gate (`tests/gate.test.ts`). See `docs/phase-8/README.md`.
