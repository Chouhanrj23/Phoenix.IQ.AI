# @phoenix-ai/redaction-hardening

**Module:** Redaction & Injection Hardening (FRD §3.2)

## Responsibility

The gate between ingestion and every downstream stage. It removes secrets and PII from artifact
content before anything is parsed, stored, persisted or rendered.

## What it does (P8)

| Requirement                 | Behaviour                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-SEC-01 scan              | `detectSecrets`: private keys, AWS key ids, GitHub/Slack tokens, JWTs, `scheme://user:PASSWORD@host`, quoted `password/secret/api_key/token…` assignments in any file, unquoted ones in config files (`.properties`, `.yml`, `.env`, …), email addresses. |
| FR-SEC-02 stable tokens     | Each value is replaced in place by `[REDACTED:<kind>:<12 hex>]`, derived from source + path + ordinal + kind, never from the value. Line breaks inside a value are kept, so file:line references stay correct. Same input gives byte-identical output.    |
| FR-SEC-03 encrypted mapping | `createRedactionVault`: AES-256-GCM, key generated per vault and held only in memory. Non-retaining: lost with the process. Renders as an opaque summary in logs and JSON.                                                                                |
| FR-SEC-04 gate              | Binary (base64) or NUL-containing content, and scanner failures, are **quarantined**, never passed. Every passed artifact is stamped (`attributes.redactionGate`); `assertRedactionGatePassed` lets a stage refuse unstamped input.                       |

## Known limits

- Pattern-based. A secret with no recognisable shape and no telling key name (`x = "hunter2"`) is
  not detected.
- References such as `${DB_PASSWORD}`, `<your-key>` and `{{ token }}` are deliberately left
  intact: they name where a secret comes from and carry configuration structure.
- `git@github.com`-style strings are email-shaped and are redacted as `email-address`.
- FR-SEC-05/06 (delimited model context, tool-less extraction agents) govern model calls. No
  Phoenix stage calls a model today, so they are not applicable yet; they become binding when one
  is added.
