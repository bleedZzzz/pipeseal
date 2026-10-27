# PipeSeal Rule: Security & Safety Guardrails

> Applies to all code, tests, and configurations within PipeSeal.

## 1. Execution Isolation
- Run all SQL verification transformations in ephemeral DuckDB `:memory:` databases unless explicitly configured otherwise.
- Never write intermediate transformation tables or temp files to disk outside the designated ephemeral workspace/scratch directory.
- Always cleanly close database connections and clean up memory structures upon run completion or cancellation.

## 2. Destructive SQL & Privilege Boundaries
- Never execute user SQL statements with elevated system privileges.
- Guard against SQL injection in internal runner queries (parameterize metadata and assertion queries).
- Block or log warnings on dangerous DuckDB extensions or PRAGMAs that compromise host security.

## 3. Secret Protection & Evidence Sanitization
- Redact credentials, connection strings, auth tokens, and sensitive headers from diagnostic messages, stack traces, and verification reports.
- Machine-readable evidence files (`report.json`) must record data hash digests and schema definitions, but never dump raw sensitive rows by default.
