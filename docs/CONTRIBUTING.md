# Contributing to PipeSeal

Thank you for considering contributing to PipeSeal! This document explains how to participate.

---

## Code of Conduct

Be respectful, constructive, and professional. We do not tolerate harassment.

---

## Getting Started

### Prerequisites

- Node.js ≥ 20.0.0
- pnpm ≥ 9.0.0
- Git

### Setup

```bash
git clone https://github.com/<your-org>/pipeseal.git
cd pipeseal
pnpm install
pnpm run build
pnpm run test
```

### Project Structure

```
packages/
  core/     — @pipeseal/core (verification engine)
  cli/      — @pipeseal/cli (command-line interface)
  duckdb/   — @pipeseal/duckdb (DuckDB execution adapter)
examples/   — Demonstration and tutorial examples
docs/       — Project documentation
```

---

## Development Workflow

1. **Create a branch** from `main` for your change.
2. **Make your changes** in the relevant package(s).
3. **Write tests** for new functionality. See `docs/TEST-STRATEGY.md`.
4. **Run the full test suite:** `pnpm run test`
5. **Run the linter:** `pnpm run lint`
6. **Submit a pull request** with a clear description of your change.

---

## What We Accept

| Contribution Type                        | Welcome?                                    |
| ---------------------------------------- | ------------------------------------------- |
| Bug fixes with tests                     | ✅ Yes                                      |
| New check types with tests               | ✅ Yes                                      |
| Documentation improvements               | ✅ Yes                                      |
| Performance improvements with benchmarks | ✅ Yes                                      |
| New execution adapters                   | ✅ Yes (discuss first)                      |
| Dependency additions                     | ⚠️ Discuss first — we minimize dependencies |
| New CLI commands                         | ⚠️ Discuss first — scope must match PRD     |
| Web UI / dashboard                       | ❌ Out of scope                             |
| LLM-dependent features                   | ⚠️ Discuss first — must be optional         |

---

## Architecture Decisions

Significant design decisions are documented in `docs/decisions/`. Before proposing a change that conflicts with an existing decision, read the relevant ADR and propose an update if you have new evidence.

---

## Commit Messages

Use conventional commits:

```
feat(core): add uniqueness check for composite columns
fix(cli): correct exit code when config file is missing
docs: update README installation instructions
test(duckdb): add timeout integration test
```

---

## Testing

- Every new check type needs a pass test and a fail test.
- Use real DuckDB instances, not mocks.
- Test fixtures go in `test/fixtures/` and must be synthetic (no real data).
- See `docs/TEST-STRATEGY.md` for details.

---

## License

By contributing to PipeSeal, you agree that your contributions will be licensed under the Apache License 2.0.
