# @phoenix-ai/web

Review & correction UI. Built on React + Vite + Tailwind, with reactflow for diagrams and
recharts for stats.

Implements the PRD's UX Principles (§8): every element exposes provenance/confidence,
low-confidence elements are visually distinct, conflicts are surfaced (not resolved silently),
and reviewers are guided to high-leverage, low-confidence elements first.

## Two modes, one codebase

This app never imports the mock or API data source directly — every page consumes
`dataProvider` from `src/data/index.ts`, which picks an implementation based on
`VITE_DATA_SOURCE` (see `.env.example`):

- **`mock` (default)** — runs entirely in the browser against fixture data for a fictional
  system, "Aurora Commerce" (`src/data/mock/`). No backend required; this is what you want
  for a standalone demo (`pnpm build` output is a static site you can deploy anywhere).
- **`api`** — calls a running `@phoenix-ai/api` instance (`src/data/api/apiProvider.ts`). As of
  Phase 1, `@phoenix-ai/api` serves real routes for System Summary, Architecture, Domain Model,
  Integrations, Deployment/NFR, and Review/Gaps/Drift (backed by static seed data). Execution
  Flows, Personas & Journeys, Backlog, and the Graph Explorer still have no backend route — those
  pages will error in `api` mode until later phases wire them up over
  `@phoenix-ai/knowledge-graph` / `@phoenix-ai/okf-renderers` / `@phoenix-ai/review-loop`. Match
  each new endpoint's response shape to the types in `src/data/types.ts` (re-exported from
  `@phoenix-ai/shared`) and the UI needs zero changes.

## Pages

Grouped in the sidebar to mirror how the FRD organises the platform's outputs:

- **Overview** — coverage/confidence stats and recent drift alerts.
- **Knowledge Graph** — the full node/edge graph every other page projects from, filterable
  by element type; the single-source-of-truth claim made concrete.

Architecture & Design:

- **Architecture** — C4 Context and Container diagrams; click a node for description,
  confidence, and provenance.
- **Domain Model** — domains → aggregates → entities, each with a confidence badge.
- **Deployment** — where each container actually runs (environments, instance counts, runtime),
  recovered from infrastructure-as-code.
- **Integrations** — every external system this platform talks to, protocol, and data exchanged.
- **NFRs** — performance/availability/security/compliance/scalability targets, each independently
  sourced and confidence-scored.

Product & Requirements:

- **Personas & Journeys** — recovered personas and the journeys that realise them, tied back to
  execution flows (the FRD's flow-to-journey relationship).
- **Backlog** — epics → features → user stories with acceptance criteria, reconstructed from
  execution flows, tickets, and source code.
- **Execution Flows** — step-by-step flow diagrams; click a step to see what it reads/writes.

Trust & Operations:

- **Gap Analysis** — what couldn't be verified from any source, framed as a request for missing
  inputs rather than an audit finding.
- **Drift History** — what changed across successive differential runs — the platform's
  continuous-currency claim made concrete, not just a snapshot.
- **Review** — the human review & correction queue, sorted lowest-confidence first, with
  source conflicts shown side by side and Confirm/Correct actions (in-memory only in demo mode).

A global search bar (top-right) matches by name across containers, domains, flows, personas,
epics, NFRs, integrations, and gaps, and jumps straight to the right page.

## Running it

```bash
pnpm install
pnpm --filter @phoenix-ai/web dev
```

Defaults to demo mode. To point at a real API instead, copy `.env.example` to `.env.local` in
this directory and set `VITE_DATA_SOURCE=api`.
