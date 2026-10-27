# PipeSeal Rule: Code Style & Quality Standards

> Applies to all TypeScript implementation and tests in PipeSeal.

## 1. TypeScript & Architecture Standards
- Use TypeScript 5.x ESM (`import/export`, `.js` extension in relative imports if targeting NodeNext).
- Strict typing: avoid `any`; define explicit interfaces for all engine inputs, assertion options, and verification results.
- Decouple engine logic (`@pipeseal/core`) from CLI rendering (`pipeseal`). The CLI should be a thin wrapper around core API functions.

## 2. Error Handling & Exit Codes
- Use custom typed error classes (`PipeSealError`, `VerificationError`, `ExecutionTimeoutError`).
- Every error must carry an actionable message and a machine-readable code.
- Respect standardized CLI exit codes:
  - `0`: All assertions passed.
  - `1`: One or more verification assertions failed.
  - `2`: Internal error, invalid configuration, or unhandled exception.

## 3. Testing Discipline
- Every check type (schema, null, uniqueness, custom expression) must have unit tests covering both positive and negative cases.
- Use synthetic CSV and JSON fixtures for test data.
- Keep tests deterministic: never rely on live external databases or network services during unit/integration test execution.
