# Phoenix.ai

> Verified, continuously current system knowledge — reconstructed from a system's existing artifacts, every claim backed by evidence.

Enterprise systems accumulate knowledge faster than they document it. This platform reads a system's existing artifacts (source code, docs, tickets, logs, data schemas, tests) and produces a structured, evidence-backed knowledge bundle — the **OKF bundle** — describing its data models, domains, architecture, deployment topology, execution flows, integrations, and requirements. Every element carries provenance and confidence, and the platform continuously detects drift as the underlying system evolves.

See `docs/requirements/` for the full Business, Product, and Functional Requirements documents that this repository implements.

## Repository structure

```
.
├── apps/                    # Deployable applications
│   ├── api/                 # Backend API — serves the OKF bundle, review workflow
│   └── web/                 # Review & correction UI
├── packages/                # One package per pipeline module (see below)
├── docs/
│   ├── requirements/         # BRD, PRD, FRD (source of truth for scope)
│   ├── architecture/adr/     # Architecture Decision Records
│   ├── ontology/              # Knowledge graph ontology reference
│   ├── runbooks/               # Operational runbooks
│   └── phase-1/                 # Phase 1 status — what's done vs. what's still open
├── infra/                    # Docker / Kubernetes / deployment manifests
└── scripts/                   # Repo automation
```

## Pipeline modules (`packages/`)

The platform is a staged pipeline over a shared knowledge graph (per the FRD). Each stage is its own package:

| Package                 | Module                                | Responsibility                                                                                   |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ingestion-connectors`  | Ingestion & Connector Layer           | Connects to artifact sources, normalises into a common intermediate representation (CIR)         |
| `redaction-hardening`   | Redaction & Injection Hardening       | Strips secrets/PII and neutralises prompt injection before anything is stored or sent to a model |
| `extraction-engine`     | Deterministic Extraction Engine       | Extracts exact facts via parsing, not model inference                                            |
| `inference-engine`      | Semantic Inference Engine             | Interprets verified facts into domains, bounded contexts, and rationale                          |
| `knowledge-graph`       | Knowledge Graph & Provenance Store    | Single source of truth; stores all elements with provenance                                      |
| `reconciliation-engine` | Reconciliation & Confidence Engine    | Merges signals across sources, surfaces conflicts and confidence                                 |
| `okf-renderers`         | OKF Renderers                         | Projects the graph into the eleven OKF output artifact types                                     |
| `gap-analysis`          | Gap Analysis Planner                  | Reports missing inputs needed to raise confidence/coverage                                       |
| `drift-detection`       | Differential / Drift Detection Engine | Diffs runs over time and reports architectural drift                                             |
| `review-loop`           | Human Review & Correction Loop        | Captures and persists human corrections                                                          |
| `evaluation-harness`    | Evaluation Harness                    | Scores runs and gates regressions                                                                |
| `orchestration`         | Orchestration                         | Sequences the pipeline, guarantees reproducibility                                               |
| `shared`                | —                                     | Common types, logging, config, and utilities used across packages                                |

Module trust boundary (per FRD §2.2): extraction agents that read untrusted content have no tools and no write access — they emit structured claims only. Only validated claims enter the graph.

## Getting started

Prerequisites: Node.js ≥ 20 (see `.nvmrc`), pnpm ≥ 9.

```bash
corepack enable
pnpm install
pnpm build
pnpm dev
```

Common scripts (run from the repo root, orchestrated by Turborepo across all packages):

```bash
pnpm lint          # lint every package
pnpm typecheck     # type-check every package
pnpm test          # run all test suites
pnpm format        # format the whole repo with Prettier
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branching, commit conventions, and the PR process. See [docs/architecture/adr](./docs/architecture/adr) before making a significant architectural change.

## Security

This platform is designed to operate on regulated, sensitive source material (see BRD §9, Constraints). See [SECURITY.md](./SECURITY.md) for the vulnerability disclosure process and data-handling constraints.

## License

See [LICENSE](./LICENSE).
