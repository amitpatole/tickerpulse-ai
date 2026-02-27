# Branch Protection Configuration

This document describes the required GitHub branch protection settings for
`main`. These settings must be applied by a repository administrator via
**Settings → Branches → Branch protection rules**, or by running the
`Apply Branch Protection` workflow dispatch.

## Required Settings for `main`

### Status Checks
Enable **Require status checks to pass before merging** and mark all of the
following as required:

| Check | Job |
|-------|-----|
| `backend-test` | Python 3.12 test suite with 80 % coverage gate |
| `frontend-test` | Node 24 test suite + build verification |
| `electron-type-check` | TypeScript compilation check |

Enable **Require branches to be up to date before merging** to prevent stale
merges from bypassing the checks.

### Pull Request Reviews
- **Require a pull request before merging** — enabled
- **Required approvals** — 1 (minimum)
- **Dismiss stale pull request approvals when new commits are pushed** — enabled
- **Require review from Code Owners** — enabled (enforces CODEOWNERS rules)

### Additional Protections
- **Do not allow bypassing the above settings** — enabled (applies to
  administrators too; disable temporarily only when strictly necessary)
- **Restrict who can push to matching branches** — limit to release automation
  or designated maintainers

## Required Secrets

Configure these in **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Used by | Description |
|--------|---------|-------------|
| `REPO_ADMIN_TOKEN` | apply-branch-protection.yml | PAT with `repo` admin scope to apply branch protection rules |
| `CODECOV_TOKEN` | ci.yml | Codecov upload token for coverage reporting |
| `STAGING_HOST` | deploy-staging.yml | Hostname or IP of the staging server |
| `STAGING_SSH_USER` | deploy-staging.yml | SSH username on the staging server |
| `STAGING_SSH_KEY` | deploy-staging.yml | Private SSH key for staging access |
| `STAGING_DEPLOY_PATH` | deploy-staging.yml | Absolute path to the compose project on staging |
| `DEPLOY_HOST` | deploy.yml | Hostname or IP of the production server |
| `DEPLOY_USER` | deploy.yml | SSH username on the production server |
| `DEPLOY_KEY` | deploy.yml | Private SSH key for production access |
| `DEPLOY_PATH` | deploy.yml | Absolute path to the compose project on production |

## Required Repository Variables

Configure these in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Used by | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | deploy.yml | Backend API URL baked into the frontend image at build time |
| `STAGING_BASE_URL` | deploy-staging.yml | Base URL of the staging server for smoke tests (e.g. `https://staging.example.com`) |