# Reverse-engineering run

You supply the inputs, then generate: a half-complete BRD, screenshots of the website, logs, data models,
telemetry and other documents go in; an enriched BRD (PDF), a knowledge graph and a module-by-module backlog
come out. Nothing is analysed until you press Generate, and only what you uploaded is used.

## In the app (normal use)

1. Keys in `apps/api/.env` (or the repo-root `.env`): `ZAI_API_KEY` (free GLM models, incl. the
   `glm-4.6v-flash` vision model that reads screenshots) and/or `GEMINI_API_KEY`.
2. `pnpm --filter @phoenix-ai/web dev`, open the project, go to **Modules**.
3. Upload on the cards (any module tab): BRD (`.md .txt .docx .html`), Screenshots (`.png .jpg`), Logs,
   Technical documents, Tickets, Data models, Database, Email notifications, Telemetrics, Source code.
   Files are saved under `inputs/<project>/<card>/<module>/` (git-ignored).
4. Optionally give a git repository link, then press **Generate BRD**. The panel shows each step; when it
   finishes, **Requirements (BRD)** shows the result and offers **Download BRD (PDF)**.

Screenshots are described by a vision model first (Z.ai `glm-4.6v-flash`, then Gemini if that one is busy);
one that no model can read right now is listed as not used, and the run continues. PDF files can't be read
yet: upload BRDs and documents as `.docx`, `.md` or `.txt`.

The same run from a terminal: `pnpm reverse-engineer --project indian-banking-system`.

## Analysing a whole repository directly

`pnpm reverse-engineer --repo <git url> --id <slug> [--brd <initial BRD file>]` clones the repository and
analyses all of it (this is how the Bank of Anthos example under `docs/reverse-engineering/bank-of-anthos/`
was produced, with `docs/reverse-engineering/examples/initial-brd.md` as the initial BRD).

## Initial BRD in, enriched BRD (PDF) out

The BRD you upload (or pass with `--brd`) is the starting point: it keeps its
intent, checks every requirement against the evidence (confirmed / partially met / not implemented /
contradicted, with file:line evidence), and adds everything the system does that the initial BRD never mentioned.

The result is printed to `docs/reverse-engineering/<id>/BRD.pdf` (cover, document control, version history,
approvals, contents, numbered requirements FR-/BR-/NFR-/IN-, diagrams, evidence appendix) using a local Chrome or
Edge in headless mode. The web app's **Requirements (BRD)** page offers it as **Download BRD (PDF)** and shows
the traceability in its own tab.

To re-run only the BRD after changing the initial BRD (keeps the other stages):

```bash
pnpm reverse-engineer --resume --redo brd
```

## What happens

| Step           | Model call?         | What it does                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Ingest       | no                  | Shallow-clones the repo into `.phoenix-workspace/reverse-engineering/<id>/source` and builds an evidence pack: READMEs, SQL schema, Kubernetes manifests, telemetry config, source code, UI templates (line-numbered), product screenshots, plus a log-event catalogue and a telemetry-signal catalogue mined from the code. |
| 1 Inventory    | yes (+ screenshots) | Services, endpoints, tables/columns, screens, external systems, business rules, log events, telemetry, deployment, missing evidence.                                                                                                                                                                                         |
| 2 Domains      | yes                 | Business domains, module coverage, entities with attributes, aggregates, relationships, glossary.                                                                                                                                                                                                                            |
| 3 Activities   | yes                 | Actions/activities per module, reports (existing and required).                                                                                                                                                                                                                                                              |
| 4 Flows        | yes                 | Execution flows, personas, user journeys.                                                                                                                                                                                                                                                                                    |
| 5 Backlog      | yes                 | Capabilities and epics → features → user stories with acceptance criteria, for all six modules.                                                                                                                                                                                                                              |
| 6 Architecture | yes                 | C4 context/container, integrations, deployment, NFRs.                                                                                                                                                                                                                                                                        |
| 7 BRD          | yes                 | Executive summary, scope, stakeholders, business rules, risks, assumptions, gaps.                                                                                                                                                                                                                                            |
| Assemble       | no                  | Validates references, converts evidence to provenance + confidence, writes the outputs below.                                                                                                                                                                                                                                |

One run is 7 requests (plus a retry for any stage whose JSON fails validation), within Gemini's free daily quota.
Each stage's result is cached under `.phoenix-workspace/.../stages/`, so a re-run (or a run that hit the
quota) resumes without re-spending requests. `--force` ignores the cache.

## Outputs

- `apps/web/src/reverse-engineering/reports/<id>.json`: the engagement dataset (every existing page reads it, plus the **Requirements (BRD)** page and the per-module panel on **Modules**)
- `docs/reverse-engineering/<id>/BRD.md`: the BRD, covering business domains, domain model (Mermaid ER), actions/activities, execution flows (Mermaid sequence), personas and journeys, reports, capabilities/epics/stories, business rules, architecture, NFRs, gaps and a glossary
- `docs/reverse-engineering/<id>/knowledge-graph.json` and `.cypher`: the graph. To load it into the local Neo4j: `cypher-shell -u neo4j -p <pw> -f docs/reverse-engineering/<id>/knowledge-graph.cypher`

## Options

| Flag / variable                                                               | Effect                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `--repo <git url> --id <slug>`                                                | Analyse another repository                                                     |
| `--assemble-only`                                                             | Rebuild the outputs from cached stages; no model calls                         |
| `--curated <dir>`                                                             | Use hand-written `<stage>.json` files instead of a model (the no-LLM fallback) |
| `GEMINI_MODEL`                                                                | Pin a model (default: newest stable `gemini-*-flash`)                          |
| `LLM_PROVIDER=openai-compatible` + `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Use Groq, OpenRouter, Cerebras, Mistral or a local server instead              |

Every element carries `evidence` (file:line) and a confidence level; elements without direct evidence are
marked `inferred` and the lowest-confidence ones are put in the Review queue.
