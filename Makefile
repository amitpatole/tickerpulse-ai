```makefile
# TickerPulse AI v3.0 — Local dev shortcuts
# Mirrors what GitHub Actions runs in CI so failures can be caught locally.

.PHONY: help test lint ci backend-test frontend-test backend-lint frontend-lint docker-build

help:
	@echo "Available targets:"
	@echo "  make test          Run all tests (backend + frontend)"
	@echo "  make lint          Run all linters (backend + frontend)"
	@echo "  make ci            Full CI simulation: lint + test"
	@echo "  make backend-test  Run Python tests with coverage"
	@echo "  make frontend-test Run Vitest tests"
	@echo "  make backend-lint  Run ruff on backend/"
	@echo "  make frontend-lint Run ESLint on frontend/"
	@echo "  make docker-build  Validate Docker images build cleanly"

# ── Tests ─────────────────────────────────────────────────────────────────────

test: backend-test frontend-test

backend-test:
	pytest backend/tests/ \
		--cov=backend \
		--cov-report=term-missing \
		--cov-fail-under=70 \
		--timeout=30 \
		-v

frontend-test:
	cd frontend && npm test

# ── Linting ───────────────────────────────────────────────────────────────────

lint: backend-lint frontend-lint

backend-lint:
	ruff check backend/

frontend-lint:
	cd frontend && npm run lint

# ── Full CI simulation ────────────────────────────────────────────────────────

ci: lint test
	@echo "✓ CI checks passed"

# ── Docker build validation ───────────────────────────────────────────────────

docker-build:
	docker compose build
```