# P6-09 POC — Phoenix repo + Jira analysis (generated 2026-09-08T09:40:51.637Z)

## Source A — git (real, this repository's committed tree)

Resolved revision: 0eb3823354aa7af5e658144458c865c76bc2ac22
Total tracked files (after excluding node_modules, .git, .turbo, .next, dist, coverage, .pnpm-store): 430
Per-ticket ADR commit status (real, read from git's committed tree):
p6-01 docs/architecture/adr/0026-p6-01-connector-framework-hardening.md → Not Started
p6-02 docs/architecture/adr/0027-p6-02-jira-connector.md → Not Started
p6-04 docs/architecture/adr/0028-p6-04-jira-okf-mapping.md → Not Started
p6-05 docs/architecture/adr/0029-p6-05-source-reconciliation.md → Not Started
p6-06 docs/architecture/adr/0030-p6-06-confidence-calculation.md → Not Started
p6-08 docs/architecture/adr/0031-p6-08-evidence-aggregation.md → Not Started
p6-09 docs/architecture/adr/0032-p6-09-phoenix-jira-poc.md → Not Started

## Source B — Jira (real connector, representative dataset, see fixtures/phoenix-backlog-jira.ts)

Jira project resolved: [{"key":"PHX","id":"10100","name":"Phoenix.ai-1 Backlog"}]
Issues read: 8
Read failures: 0
Bridged WorkItemObjects: 8
Bridged relationships (contains/relatesTo): 12
Skipped (unrecognised content): 0
Per-ticket Jira status:
p6-01 PHX-2 → Done
p6-02 PHX-3 → Done
p6-04 PHX-4 → Done
p6-05 PHX-5 → Done
p6-06 PHX-6 → Done
p6-08 PHX-7 → Done
p6-09 PHX-8 → In Progress

## Reconciliation (P6-05/06/08) — comparing both sources' claims per ticket

Agreed (both sources say the same thing): 0

Conflicts (sources disagree — BOTH positions retained, never silently resolved): 7
phoenix-ticket-p6-08 ("Conflicting claims for "status" of phoenix-ticket-p6-08")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-09 ("Conflicting claims for "status" of phoenix-ticket-p6-09")
"In Progress" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-02 ("Conflicting claims for "status" of phoenix-ticket-p6-02")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-01 ("Conflicting claims for "status" of phoenix-ticket-p6-01")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-06 ("Conflicting claims for "status" of phoenix-ticket-p6-06")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-05 ("Conflicting claims for "status" of phoenix-ticket-p6-05")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)
phoenix-ticket-p6-04 ("Conflicting claims for "status" of phoenix-ticket-p6-04")
"Done" — claimed by [ticket://phoenix-internal/PHX], confidence medium, 1 evidence ref(s)
"Not Started" — claimed by [repo://phoenix-ai-1], confidence low, 1 evidence ref(s)

## Assembled OKF bundle

Bundle validates against the real validateCanonicalKnowledgeBundle: true
Every provenance/evidence sourceId resolves against the sources registry: true
OKF YAML document generated: 955 lines
OKF YAML round-trips through the real parseAndValidateOkfYaml: true
