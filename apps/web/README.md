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
- **`api`** — calls a running `@phoenix-ai/api` instance (`src/data/api/apiProvider.ts`). The
  masthead badge says which mode is active and never claims more than is live.

### Where each page's data comes from in `api` mode

| Page(s)                                                                      | Source                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview summary, Architecture, Domain Model, Integrations, Deployment, NFRs | The API's **static seed** (`apps/api/src/data/seed.ts`, the fictional "Aurora Commerce") — **not** analysis output                                               |
| Review                                                                       | The seed's review queue, with decisions **really recorded** through the API (Neo4j when configured; otherwise the page says the decision is held in memory only) |
| Drift History, Gap Analysis                                                  | **Real run output** once an analysis run exists; until then the API's seed, and the page shows a "Sample data" notice                                            |
| Knowledge Graph                                                              | **The persisted Neo4j graph** (`/api/full-graph`); an error, not fixture data, when the graph is unavailable                                                     |
| Execution Flows, Personas & Journeys, Backlog, business capabilities         | **Bundled demo fixtures** — the API has no endpoint for these; each page shows a notice saying so                                                                |

Analysis runs, their eleven artifact views and exports are served by the API
(`/api/runs/:id/…`) but are not yet shown in this UI.

## Pages

Grouped in the sidebar to mirror how the FRD organises the platform's outputs:

- **Overview** — coverage/confidence stats and recent drift alerts.
- **Knowledge Graph** — the full node/edge graph every other page projects from, filterable
  by element type; the single-source-of-truth claim made concrete.

Architecture & Design:

- **Architecture** — C4 Context and Container diagrams; click a node for description,
  confidence, and provenance.
- **Domain Model** — domains → aggregates → entities, rendered as an entity-relationship diagram
  (fields, PK/FK icons, relationship edges, cross-domain references), each with a confidence badge.
  See [`docs/web-ui/domain-model-er-diagram.md`](../../docs/web-ui/domain-model-er-diagram.md).
- **Deployment** — where each container runs (environments, instance counts, runtime). Shown
  from seed/fixture data; IaC extraction exists in the pipeline but does not feed this page yet.
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
  source conflicts shown side by side and Confirm/Correct actions (browser-only in demo mode;
  recorded through the API in `api` mode).

A global search bar (top-right) matches by name across containers, domains, flows, personas,
epics, NFRs, integrations, and gaps, and jumps straight to the right page.

## Running it

```bash
pnpm install
pnpm build                          # once: @phoenix-ai/shared resolves through its dist/ output
pnpm --filter @phoenix-ai/web dev   # http://localhost:3000
```

Defaults to demo mode. To point at a running API instead, copy `.env.example` to `.env.local` in
this directory and set `VITE_DATA_SOURCE=api` (and `VITE_API_BASE_URL` if the API is not on
`http://localhost:3001`). The API must allow this origin (`CORS_ORIGIN`, default
`http://localhost:3000`).

Tests: `pnpm --filter @phoenix-ai/web test`. The check that this UI only calls endpoints the API
really serves lives in `apps/api/tests/web-contract.test.ts`.
