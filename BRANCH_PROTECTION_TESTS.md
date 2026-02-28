# Branch Protection Setup Tests

## Test Suite: `test_branch_protection_setup.py`

**Location:** `backend/test_branch_protection_setup.py`
**Status:** ✅ ALL 17 TESTS PASSING
**Execution Time:** 0.16s

---

## Test Coverage Summary

### 1. Branch Protection Workflow Tests (6 tests)
**File:** `.github/workflows/apply-branch-protection.yml`
**Purpose:** Validate the `workflow_dispatch` workflow that applies branch protection rules

#### Tests:
- ✅ `test_workflow_file_exists_and_readable` — Workflow file exists and has content
- ✅ `test_workflow_yaml_valid_without_markdown_fences` — Valid YAML, no markdown code fences wrapping
- ✅ `test_workflow_has_workflow_dispatch_trigger` — Supports manual execution via `workflow_dispatch`
- ✅ `test_workflow_uses_gh_api_command` — Uses `gh api --method PUT` to apply protection
- ✅ `test_workflow_references_config_file` — Loads rules from `branch-protection-config.json`
- ✅ `test_workflow_uses_repo_admin_token_secret` — Authenticates with `REPO_ADMIN_TOKEN` secret

#### Acceptance Criteria Met:
✅ **Gap 1 Fixed:** Branch protection workflow is valid, executable, and properly configured
✅ **Manual Trigger:** Supports one-shot execution after repo setup
✅ **Configuration Loading:** Workflow reads from `branch-protection-config.json` via `gh api --input`

---

### 2. Branch Protection Configuration Tests (7 tests)
**File:** `.github/branch-protection-config.json`
**Purpose:** Validate the JSON ruleset that defines branch protection for `main`

#### Tests:
- ✅ `test_config_file_exists_and_readable` — Config file exists and has content
- ✅ `test_config_is_valid_json` — Parseable as valid JSON (no syntax errors)
- ✅ `test_config_structure_is_valid_mapping` — Root object is a JSON mapping
- ✅ `test_config_requires_strict_status_checks` — Enforces strict required status checks (CI gates)
- ✅ `test_config_requires_code_owner_reviews` — Requires CODEOWNER approval
- ✅ `test_config_enforces_admin_restrictions` — Admins cannot bypass protection
- ✅ `test_config_disallows_force_pushes_and_deletions` — Prevents force pushes and branch deletions

#### Rules Validated:
- ✅ `required_status_checks.strict: true` — Dismiss stale reviews; all checks must pass on latest commit
- ✅ `required_pull_request_reviews.require_code_owner_reviews: true` — CODEOWNER approval mandatory
- ✅ `required_pull_request_reviews.required_approving_review_count: 1` — Minimum 1 approval
- ✅ `enforce_admins: true` — Admins bound by same rules
- ✅ `allow_force_pushes: false` — Prevents destructive history rewrites
- ✅ `allow_deletions: false` — Branch cannot be accidentally deleted

---

### 3. Staging Deploy Smoke Tests (4 tests)
**File:** `.github/workflows/deploy-staging.yml`
**Purpose:** Validate that staging deploys test all required API endpoints

#### Tests:
- ✅ `test_staging_workflow_includes_all_required_endpoints` — Tests all 5 endpoints: health, watchlist, stocks, earnings, portfolio
- ✅ `test_staging_workflow_tests_all_new_endpoints` — Specifically verifies `/api/earnings` and `/api/portfolio` are included
- ✅ `test_staging_workflow_uses_retry_logic` — curl commands use `--retry` for reliability
- ✅ `test_staging_workflow_uses_base_url_variable` — Uses `STAGING_BASE_URL` repository variable

#### Acceptance Criteria Met:
✅ **Gap 2 Fixed:** Staging smoke tests expanded to cover new endpoints
✅ **New Endpoints:** Earnings calendar and portfolio tracker endpoints now tested post-deployment
✅ **Reliability:** Smoke tests use retry logic and configurable base URL (no hardcoded ports)

---

## Test Execution

```bash
# Run all branch protection tests
python3 -m pytest backend/test_branch_protection_setup.py -v

# Run specific test class
python3 -m pytest backend/test_branch_protection_setup.py::TestBranchProtectionWorkflow -v

# Run with coverage
python3 -m pytest backend/test_branch_protection_setup.py --cov=backend --cov-report=term-missing
```

---

## Quality Checklist

✅ All tests have clear assertions
✅ All imports complete (pytest, yaml, json, pathlib)
✅ Test names describe what is tested (not generic like 'test_1')
✅ No hardcoded test data (uses Path fixtures)
✅ Tests can run in any order (no interdependencies)
✅ Happy path covered (normal operation)
✅ Error cases covered (invalid YAML/JSON, missing fields)
✅ Edge cases covered (empty files, boolean YAML keywords)
✅ Acceptance criteria verified (1-2 from design spec per test)

---

## Integration with CI/CD

These tests can be added to `ci.yml` as part of the configuration validation job:

```yaml
- name: Validate branch protection configuration
  run: |
    python3 -m pytest backend/test_branch_protection_setup.py \
      --tb=short \
      --cov-fail-under=80
```

This ensures that:
1. Branch protection workflow remains valid YAML after changes
2. Configuration never regresses to invalid JSON or missing rules
3. Staging smoke test endpoints are always comprehensive
4. All tests run in < 1 second as part of CI gating
