# Branch Protection Configuration

This document describes the required GitHub branch protection settings for
`main`. Apply them via **Settings → Branches → Branch protection rules** or
by running the `Apply Branch Protection` workflow dispatch (which applies
`branch-protection-config.json` via the GitHub API).

---

## Required Settings for `main`

### Status Checks

Enable **Require status checks to pass before merging** and mark all of the
following as required:

| Check | Job | Failure condition |
|-------|-----|-------------------|
| `backend-test` | Python 3.12 test suite | Coverage < 80 % or any test fails |
| `frontend-test` | Node 24 / Jest test suite | Coverage < 80 % or any test fails |
| `build-windows-pr` | Electron TypeScript compile check (PRs only) | Any `tsc` error |
| `staging-smoke` | Six-endpoint smoke tests after each CI-green staging deploy | Any endpoint returns non-2xx |

Enable **Require branches to be up to date before merging** so that stale
branches cannot bypass checks that run on the target commit.

### Pull Request Reviews

- **Require a pull request before merging** — enabled
- **Required approvals** — 1 (minimum)
- **Dismiss stale pull request approvals when new commits are pushed** — enabled
- **Require review from Code Owners** — enabled (enforces `.github/CODEOWNERS`)

### Additional Protections

- **Do not allow bypassing the above settings** — enabled; applies to
  administrators. Disable only temporarily and with deliberate justification.
- **Allow force pushes** — disabled
- **Allow deletions** — disabled

---

## Required Secrets

Configure these under **Settings → Secrets and variables → Actions → Secrets**.
Full descriptions and workflow mapping are in `.github/SECRETS.md`.

| Secret | Required by | Description |
|--------|------------|-------------|
| `REPO_ADMIN_TOKEN` | `apply-branch-protection.yml` | PAT with `repo` admin scope; used to call the GitHub branch-protection API |
| `CODECOV_TOKEN` | `ci.yml` | Codecov upload token. Optional — `fail_ci_if_error: false` means absence does not break CI, but uploads may be rate-limited |
| `STAGING_DEPLOY_TOKEN` | `deploy-staging.yml` | Platform credentials for staging (AWS, Fly.io, Heroku, etc.). Replace the placeholder `echo` step once a platform is chosen |
| `PRODUCTION_DEPLOY_TOKEN` | `deploy.yml` | Platform credentials for production. Same pattern as staging |

`GITHUB_TOKEN` is automatically injected by GitHub into every workflow run.
No manual setup is required.

---

## Required Repository Variables

Configure these under **Settings → Secrets and variables → Actions → Variables**.

| Variable | Required by | Description |
|----------|------------|-------------|
| `STAGING_BASE_URL` | `deploy-staging.yml` | Base URL of the staging environment (e.g. `https://tickerpulse-staging.example.com`). Used by the smoke-test job; the job fails with a clear error message if this is unset |
| `PRODUCTION_URL` | `deploy.yml` | Public URL of the production environment. Displayed as the environment link in the Actions UI after a successful deploy |

---

## Notes

- The `branch-protection-config.json` file in this directory is the
  machine-readable source of truth for the four required status checks.
  Run the `Apply Branch Protection` workflow dispatch after any change to
  that file to re-apply the ruleset.
- Secrets and variables for SSH-based deployment are **not** used. The
  current workflows accept a single opaque `*_DEPLOY_TOKEN` per environment,
  keeping credentials platform-agnostic.