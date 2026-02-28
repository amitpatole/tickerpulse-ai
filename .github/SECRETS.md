# Repository Secrets & Variables

All credentials and configuration values required to run the GitHub Actions
workflows. Configure these in **Settings → Secrets and variables → Actions**
before running any deployment workflow.

---

## Secrets

### Required

| Name | Required by | Description |
|------|-------------|-------------|
| `STAGING_DEPLOY_TOKEN` | deploy-staging.yml | Deployment credential for the staging environment. Replace the placeholder echo commands with the real deploy command for your hosting platform (e.g. SSH key, cloud provider CLI token). |
| `PRODUCTION_DEPLOY_TOKEN` | deploy.yml | Deployment credential for the production environment. Replace the placeholder echo commands with the real deploy command for your hosting platform. |

### Auto-provided by GitHub

The following token is automatically injected by GitHub Actions for every
workflow run and does not need to be configured manually.

| Name | Required by | Description |
|------|-------------|-------------|
| `GITHUB_TOKEN` | All workflows | Automatically injected by GitHub Actions for each workflow run. Provides write access to repository contents, packages, and releases. Scoped to the current run and expires when the run ends. |

---

## Repository Variables

Variables (non-sensitive configuration) set under
**Settings → Secrets and variables → Actions → Variables**.

| Name | Description |
|------|-------------|
| `STAGING_BASE_URL` | Base URL of the staging deployment (e.g. `https://staging.tickerpulse.ai`). Used by the smoke tests that run after each staging deployment to verify the environment is healthy. |

---

## Workflow → Secret mapping

| Workflow | Secrets & Variables used |
|----------|--------------------------|
| ci.yml | None — test environment uses fixed values defined inline |
| deploy.yml | `GITHUB_TOKEN` (auto), `PRODUCTION_DEPLOY_TOKEN` |
| deploy-staging.yml | `GITHUB_TOKEN` (auto), `STAGING_DEPLOY_TOKEN`, `STAGING_BASE_URL` (var) |
| apply-branch-protection.yml | `GITHUB_TOKEN` (auto) |
| pr-lint.yml | `GITHUB_TOKEN` (auto) |
| build-windows.yml | `GITHUB_TOKEN` (auto) |

---

## Security notes

- **Never commit actual credential values or tokens** to this repository.
  Only token names and descriptions belong here.
- The `GITHUB_TOKEN` is scoped to each workflow run and expires automatically.
- For staging and production, configure environment-specific protection rules
  and required reviewers in **Settings → Environments**.
- Replace the placeholder deploy commands in `deploy.yml` and
  `deploy-staging.yml` with the real deploy command for your platform before
  using these workflows in production.
- Rotate `STAGING_DEPLOY_TOKEN` and `PRODUCTION_DEPLOY_TOKEN` regularly,
  especially after team membership changes.
