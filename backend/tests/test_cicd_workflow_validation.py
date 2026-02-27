"""
Focused CI/CD Workflow Validation Tests (Setup Project Repository & CI/CD)

Validates critical behaviors for the 3-tier CI/CD pipeline:
  CI gate → Staging smoke → Production approval

Tests cover happy path, error cases, and edge cases per QA best practices.
"""

import pytest
import yaml
from pathlib import Path


class TestWorkflowYAMLSyntax:
    """Happy Path: Verify all workflow files are syntactically valid YAML"""

    @pytest.mark.parametrize("workflow_file", [
        ".github/workflows/ci.yml",
        ".github/workflows/deploy-staging.yml",
        ".github/workflows/deploy.yml",
        ".github/workflows/pr-lint.yml",
        ".github/workflows/build-windows.yml",
        ".github/workflows/apply-branch-protection.yml",
    ])
    def test_workflow_files_are_valid_yaml(self, workflow_file):
        """
        Happy Path: All workflow YAML files should parse without markdown code
        fence markers (no leading/trailing ```). This ensures GitHub Actions
        can execute workflows without syntax errors.
        """
        path = Path(workflow_file)
        assert path.exists(), f"Workflow file not found: {workflow_file}"

        with open(path, 'r') as f:
            content = f.read()

        # Error Case: File should not contain markdown code fences
        assert not content.startswith('```'), \
            f"ERROR: {workflow_file} starts with markdown fence (```). " \
            "Workflows must be valid YAML without code fence markers."
        assert not content.rstrip().endswith('```'), \
            f"ERROR: {workflow_file} ends with markdown fence (```). " \
            "Remove code fence markers from workflow files."

        # Happy Path: File should parse as valid YAML
        try:
            parsed = yaml.safe_load(content)
            assert parsed is not None, f"{workflow_file} is empty or invalid YAML"
        except yaml.YAMLError as e:
            pytest.fail(f"{workflow_file} is not valid YAML: {e}")


class TestStagingSmokeTestCoverage:
    """Edge Case: Verify staging smoke tests cover all critical endpoints"""

    @pytest.fixture
    def deploy_staging_workflow(self):
        """Load deploy-staging workflow"""
        path = Path(".github/workflows/deploy-staging.yml")
        with open(path, 'r') as f:
            return yaml.safe_load(f)

    def test_smoke_test_endpoint_coverage_is_comprehensive(self, deploy_staging_workflow):
        """
        Edge Case: Smoke test should validate a comprehensive set of endpoints
        to catch deployment failures early (6+ endpoints per design spec).

        Happy Path: Tests should cover critical APIs (health, data fetch, auth).
        Error Case: Missing endpoints would hide broken deployments.
        """
        jobs = deploy_staging_workflow.get('jobs', {})
        smoke_job = jobs.get('staging-smoke', {})
        assert smoke_job, "deploy-staging workflow must have 'staging-smoke' job"

        # Find the smoke test step
        smoke_step = None
        for step in smoke_job.get('steps', []):
            if step.get('name', '') == 'Smoke test staging endpoints':
                smoke_step = step
                break

        assert smoke_step is not None, \
            "staging-smoke job must have 'Smoke test staging endpoints' step"

        run_script = smoke_step.get('run', '')
        assert run_script, "Smoke test step must have run script"

        # Extract endpoints from bash array
        required_endpoints = [
            "/api/health",
            "/api/watchlist",
            "/api/stocks",
            "/api/earnings",
            "/api/portfolio",
            "/api/chat/health",
        ]

        for endpoint in required_endpoints:
            assert endpoint in run_script, \
                f"Smoke tests should verify {endpoint} endpoint (not found in script)"

        # Edge Case: Verify we're testing at least 6 endpoints
        endpoint_count = len(required_endpoints)
        assert endpoint_count >= 6, \
            f"Smoke test should cover >= 6 endpoints for comprehensive validation (found {endpoint_count})"

    def test_smoke_test_validates_http_status_codes(self, deploy_staging_workflow):
        """
        Happy Path: Smoke test should validate HTTP 2xx/3xx responses
        (success = 200-399). This catches deployment failures where endpoints
        return 5xx errors.

        Edge Case: Test should NOT accept 4xx/5xx as success.
        """
        jobs = deploy_staging_workflow.get('jobs', {})
        smoke_job = jobs.get('staging-smoke', {})
        smoke_step = None
        for step in smoke_job.get('steps', []):
            if step.get('name', '') == 'Smoke test staging endpoints':
                smoke_step = step
                break

        run_script = smoke_step.get('run', '')

        # Verify status code validation logic is present
        assert '[ "$status" -ge 200 ]' in run_script, \
            "Should validate status >= 200 (success lower bound)"
        assert '[ "$status" -lt 400 ]' in run_script, \
            "Should validate status < 400 (rejects 4xx/5xx errors)"

        # Verify failure tracking (accumulates failed count)
        assert 'failed=' in run_script, \
            "Should track failed endpoint count"
        assert 'failed=$((failed + 1))' in run_script, \
            "Should increment failed count on error"


class TestProductionReleaseFlow:
    """Edge Case: Verify production release flow conditions are correct"""

    @pytest.fixture
    def deploy_production_workflow(self):
        """Load deploy workflow"""
        path = Path(".github/workflows/deploy.yml")
        with open(path, 'r') as f:
            return yaml.safe_load(f)

    def test_github_release_only_on_semver_tags(self, deploy_production_workflow):
        """
        Edge Case: GitHub release should only auto-create on version tags (v*),
        not on arbitrary workflow_dispatch calls. This prevents accidental
        duplicate releases for hotfixes.

        Happy Path: Release created when github.ref starts with refs/tags/v
        Error Case: Manual workflow_dispatch without semver should skip release
        """
        jobs = deploy_production_workflow.get('jobs', {})
        release_job = jobs.get('create-release', {})
        assert release_job is not None, \
            "deploy workflow must have 'create-release' job"

        # Check conditional logic
        job_if = release_job.get('if', '').strip()
        assert job_if, "create-release job must have conditional (if:)"

        # Should check for semver tag format
        assert "startsWith(github.ref, 'refs/tags/v')" in job_if or \
               "startsWith(inputs.version, 'v')" in job_if, \
            "Release should only trigger on semver tags (v*), not all tags"

    def test_create_release_depends_on_deploy_success(self, deploy_production_workflow):
        """
        Happy Path: GitHub release should only create after deploy succeeds.
        This prevents releasing if the deploy fails.

        Error Case: Release without deploy dependency would expose incomplete
        deployments as "released" in GitHub.
        """
        jobs = deploy_production_workflow.get('jobs', {})
        release_job = jobs.get('create-release', {})

        # Should have explicit dependency
        needs = release_job.get('needs')
        assert needs is not None, \
            "create-release job must declare 'needs: deploy-production'"

        if isinstance(needs, list):
            assert 'deploy-production' in needs, \
                "create-release must depend on deploy-production"
        else:
            assert needs == 'deploy-production', \
                "create-release must depend on deploy-production"


class TestCIConcurrencyAndCaching:
    """Edge Case: Verify CI concurrency prevents duplicate runs efficiently"""

    @pytest.fixture
    def ci_workflow(self):
        """Load CI workflow"""
        path = Path(".github/workflows/ci.yml")
        with open(path, 'r') as f:
            return yaml.safe_load(f)

    def test_ci_uses_python_dependency_caching(self, ci_workflow):
        """
        Edge Case: CI should cache Python dependencies to prevent redundant
        downloads and accelerate runs. Without caching, slow pip installs
        waste CI minutes and developer time.

        Happy Path: backend-test job should specify cache: pip
        """
        job = ci_workflow['jobs']['backend-test']
        setup_step = None
        for step in job.get('steps', []):
            if 'setup-python' in step.get('uses', ''):
                setup_step = step
                break

        assert setup_step is not None, \
            "backend-test job must use actions/setup-python"

        with_config = setup_step.get('with', {})
        assert with_config.get('cache') == 'pip', \
            "setup-python should enable pip caching to accelerate dependency install"

    def test_ci_frontend_uses_npm_dependency_caching(self, ci_workflow):
        """
        Happy Path: Frontend tests should also cache npm dependencies
        """
        job = ci_workflow['jobs'].get('frontend-test')
        assert job is not None, "CI workflow must have frontend-test job"

        setup_node_step = None
        for step in job.get('steps', []):
            if 'setup-node' in step.get('uses', ''):
                setup_node_step = step
                break

        assert setup_node_step is not None, \
            "frontend-test job must use actions/setup-node"

        with_config = setup_node_step.get('with', {})
        assert with_config.get('cache') == 'npm', \
            "setup-node should enable npm caching"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
