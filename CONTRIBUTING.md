```markdown
# Contributing to TickerPulse AI

Thanks for your interest in contributing to TickerPulse AI! This guide covers everything you need to get started locally and submit a pull request.

## Prerequisites

- Python **3.12**
- Node.js **24** and npm
- Git

> The CI pipeline runs on Python 3.12 and Node.js 24. Using different versions locally may produce different results.

## Local Development Setup

### Backend

```bash
python3 -m venv venv
source venv/bin/activate        # Linux/macOS
# or: venv\Scripts\activate     # Windows

pip install -r backend/requirements.txt
pip install -r backend/requirements-test.txt   # test dependencies

cp .env.example .env
# Edit .env and add at least one AI provider API key (ANTHROPIC_API_KEY recommended)

python backend/app.py
# API available at http://localhost:5000
```

### Frontend

```bash
cd frontend
npm ci --legacy-peer-deps
npm run dev
# Dashboard at http://localhost:3000
```

### Electron (desktop wrapper)

```bash
cd electron
npm install
npx tsc --noEmit   # verify TypeScript compiles
```

### Both (quick start)

```bash
./run.sh
```

---

## Running Tests

### Backend

```bash
# From repo root — pytest.ini supplies --cov=backend --cov-fail-under=80
PYTHONPATH=. python -m pytest -q --tb=short
```

Coverage threshold: **80%** (enforced in CI). Agents and data_providers are excluded.

### Frontend

```bash
cd frontend
npm run test:ci   # Jest with --ci --coverage
```

Coverage threshold: **80%** (enforced in CI).

### Electron

```bash
cd electron
npx tsc --noEmit   # type-check only; unit tests via npm run test:ci when configured
```

---

## Branch Naming

Use the pattern `<topic>/<ticket-id>-<short-description>` where `topic` is a broad area:

| Topic prefix | When to use |
|---|---|
| `feature/` | New user-facing functionality |
| `fix/` | Bug fixes |
| `ci/` | CI/CD and infrastructure changes |
| `docs/` | Documentation-only changes |
| `refactor/` | Code restructuring without behaviour change |
| `test/` | Test-only additions or fixes |

Examples:
```
feature/vo-123-portfolio-tracker
fix/vo-356-sse-race-condition
ci/vo-001-setup-github-actions
docs/vo-099-update-contributing
```

---

## Commit Messages

All commit messages must follow the **Conventional Commits** format:

```
<type>: <short description>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`.

The subject (after `": "`) must be a lowercase, imperative-mood summary of _why_ the change was made, not _what_ files changed.

**Valid examples:**

```
feat: add portfolio tracker with P&L calculations
fix: correct off-by-one offset in chart pagination endpoint
ci: enforce conventional commit format on PR titles
docs: document branch naming and PR flow
refactor: extract SSE event builder into helper function
test: add race condition tests for settings_manager lock
```

**Invalid examples:**
```
Added portfolio tracker          # no type prefix
fix: Fixed the bug               # capitalised subject, past tense
feat(portfolio): add tracker     # scopes are allowed but not required
WIP: still working on this       # WIP PRs should be opened as drafts
```

> **Automated enforcement:** the `PR Lint` workflow checks the PR title on every push. Merge is blocked until the title is valid.

---

## Pull Request Flow

### 1. Prepare

- Branch from `main` using the naming convention above.
- Keep PRs focused — one feature or fix per PR.
- All 4 CI checks must pass before merge.

### 2. Required CI Checks

| Check | Command | Threshold |
|---|---|---|
| `backend-test` — Backend Tests (Python 3.12) | `pytest` | 80% coverage |
| `frontend-test` — Frontend Tests (Node 24) | `npm run test:ci` | 80% coverage |
| `build-windows-pr` — Windows Build Check (PR) | `npx tsc --noEmit` | zero errors |
| `staging-smoke` — Staging Smoke Tests | automated post-deploy | all 6 endpoints 2xx |

All 4 are required status checks — the PR cannot be merged until all pass.

### 3. Code Review

- At least **1 approving review** from a CODEOWNER is required (see `.github/CODEOWNERS`).
- Stale reviews are dismissed on new pushes.
- Admins are subject to the same rules.

### 4. PR Title

The PR title is the squash-merge commit message. It must be a valid conventional commit (`type: subject`). The `PR Lint` check enforces this automatically.

### 5. After Merge

Merging to `main` triggers:
1. Docker images built and pushed to GHCR.
2. Staging deploy + 6-endpoint smoke tests.
3. On `v*` tags: production deploy (requires `production` environment approval).

---

## Project Structure

```
tickerpulse-ai/
├── backend/           # Python Flask backend
│   ├── api/           # REST API route blueprints
│   ├── agents/        # Multi-agent system (CrewAI / OpenClaw)
│   ├── core/          # Core modules (AI providers, stock manager, etc.)
│   ├── data_providers/# Pluggable stock data providers
│   └── jobs/          # Scheduled job definitions
├── frontend/          # React/Next.js dashboard
├── electron/          # Electron desktop wrapper
└── .github/           # CI/CD workflows, branch protection, CODEOWNERS
```

---

## Coding Conventions

**Python (backend)**
- Follow PEP 8 and use type hints where practical.
- Keep Flask blueprints to one file per domain (stocks, news, agents, etc.).
- Data providers and agents follow the ABC + Registry pattern — see `data_providers/base.py` and `agents/base.py`.
- Use `db_session(immediate=True)` for any read-then-write database operations to avoid TOCTOU races.

**TypeScript/React (frontend)**
- Use functional components with hooks.
- Keep components in `frontend/src/components/`.
- Use the existing API client patterns in `frontend/src/lib/api.ts`.

**Electron**
- Main process code lives in `electron/main/`.
- Preload scripts in `electron/preload/`.
- The bridge object exposed to the renderer is `window.tickerpulse`.

---

## Adding a Data Provider

1. Create a new file in `backend/data_providers/` (e.g., `my_provider.py`).
2. Subclass `DataProvider` from `backend/data_providers/base.py`.
3. Implement the required abstract methods.
4. Register the provider in the provider registry.

See `yfinance_provider.py` for a reference implementation.

## Adding an Agent

1. Create a new file in `backend/agents/` (e.g., `my_agent.py`).
2. Subclass the base agent class from `backend/agents/base.py`.
3. Register the agent in `backend/agents/__init__.py`.

See `scanner_agent.py` for a reference implementation.

---

## Important Notes

- TickerPulse AI is a **research and monitoring tool**. It does not execute trades or provide financial advice. Contributions must not add trade execution functionality.
- Do not commit API keys, credentials, or `.env` files.
- Database files (`*.db`, `*.sqlite`) are gitignored — do not commit them.

## License

By contributing, you agree that your contributions will be licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE).

All contributions must include attribution to the original project and maintain the GPL-3.0 license headers where applicable.

## Questions?

Open an issue on [GitHub](https://github.com/amitpatole/tickerpulse-ai/issues) for questions, bug reports, or feature requests.
```