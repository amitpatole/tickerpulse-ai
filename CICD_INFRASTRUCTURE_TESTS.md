# CI/CD Infrastructure Validation Tests

**File:** `backend/tests/test_cicd_infrastructure.py`
**Status:** ✅ **11/11 PASSING**
**Date:** 2026-02-28

---

## Overview

These tests validate the CI/CD infrastructure to prevent configuration regressions. They check:
- Docker Compose YAML syntax and service configuration
- GitHub Workflows have required permissions blocks
- Backend requirements.txt is valid and includes testing tools
- All workflow files are syntactically valid YAML

---

## Test Coverage (11 Tests)

### Docker Compose Validation (3 tests)

| Test | Purpose | Acceptance Criteria |
|------|---------|-------------------|
| `test_docker_compose_valid_yaml` | Ensures docker-compose.yml parses as valid YAML (no markdown fences) | AC1: File is valid YAML without code fences |
| `test_docker_compose_services_configured` | Validates backend and frontend services are properly configured | AC2: Both services have build, ports, environment, volumes |
| `test_docker_compose_healthcheck_configured` | Ensures backend service has healthcheck configured | AC3: Healthcheck exists with /api/health test |

**What it catches:**
- Markdown code fences wrapping the file (breaks `docker compose build`)
- Missing service configurations (build, ports, environment)
- Missing healthcheck on backend

---

### Backend Requirements Validation (3 tests)

| Test | Purpose | Acceptance Criteria |
|------|---------|-------------------|
| `test_requirements_txt_no_markdown_fences` | Ensures requirements.txt is plain text (no markdown code fences) | AC1: File has no ` ``` ` markers |
| `test_requirements_includes_testing_tools` | Verifies pytest and ruff are present for CI | AC2: Both `pytest` and `ruff` are listed |
| `test_requirements_valid_syntax` | All non-comment lines are valid package specifications | AC3: All package specs match PEP 508 syntax |

**What it catches:**
- Markdown code fences wrapping the file (breaks `pip install`)
- Missing `ruff` (needed for backend linting in CI)
- Invalid package specification syntax

---

### GitHub Workflow Permissions (5 tests)

| Test | Purpose | Acceptance Criteria |
|------|---------|-------------------|
| `test_ci_workflow_has_permissions` | CI workflow has permissions block (security best practice) | AC1: `ci.yml` has `permissions:` key |
| `test_deploy_workflow_has_contents_write` | Deploy workflow can create releases | AC2: `deploy.yml` has `permissions.contents: write` |
| `test_branch_protection_workflow_has_admin_perms` | Branch protection job has admin permissions | AC3: `apply-branch-protection.yml` has `permissions.administration: write` |
| `test_all_workflows_valid_yaml` | All workflow files are syntactically valid | AC4: All `.github/workflows/*.yml` parse as valid YAML |
| `test_workflows_have_checkout_step` | Build/test/deploy jobs have checkout step | AC5: Critical jobs (`backend-ci`, `frontend-ci`, `build-check`, `deploy-production`, `build-windows`) checkout code |

**What it catches:**
- Missing `permissions:` blocks (security violation)
- Incorrect permissions for specific operations (e.g., missing `contents: write` breaks `gh release create`)
- Invalid YAML syntax in workflow files
- Missing checkout steps in jobs that need code access

---

## Implementation Notes

### Key Test Patterns

1. **File parsing:** Uses `yaml.safe_load()` to validate YAML syntax
2. **Path resolution:** `@pytest.fixture repo_root` computes repo root from test file location
3. **Edge cases:** Tests for both presence/absence and valid values
4. **Clear assertions:** Each test has explicit failure messages showing what's wrong

### Running the Tests

```bash
# Run all CI/CD infrastructure tests
pytest backend/tests/test_cicd_infrastructure.py -v

# Run specific test class
pytest backend/tests/test_cicd_infrastructure.py::TestDockerCompose -v

# Run with coverage
pytest backend/tests/test_cicd_infrastructure.py --cov=backend/tests
```

### Dependencies

- `pytest>=8.0.0` (already in `backend/requirements.txt`)
- `pyyaml` (bundled with PyYAML package, included transitively)

---

## Why These Tests Matter

The CI/CD infrastructure is critical—failures here break the entire deployment pipeline. These tests catch:

1. **Configuration Errors:** Markdown wrapping, missing permissions, invalid syntax
2. **Drift:** Ensures workflows stay consistent with design spec
3. **Security:** Validates least-privilege permissions blocks
4. **Reliability:** Confirms all workflows can execute without YAML parse errors

Running these tests **before** pushing CI/CD changes prevents:
- ❌ Broken builds that require PR force-push to fix
- ❌ Release automation failures
- ❌ Branch protection failing to apply
- ❌ Docker image build failures

---

## Test Results

```
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.0.2, pluggy-1.6.0
rootdir: /home/ubuntu/.../tickerpulse-checkout/backend
configfile: pytest.ini
collected 11 items

backend/tests/test_cicd_infrastructure.py ...........                    [100%]

======================== 11 passed in 0.28s =========================
```

All tests are **independent** and can run in any order. No external dependencies or fixtures needed beyond standard pytest + PyYAML.
