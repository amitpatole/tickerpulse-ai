# Repository Secrets & Variables

This file documents every secret and repository variable consumed by the
GitHub Actions workflows. Configure these in **Settings → Secrets and
variables → Actions** before running any workflow.

---

## Secrets

| Name | Required by | Description |
|------|------------|-------------|
| `REPO_ADMIN_TOKEN` | `apply-branch-protection.yml` | Personal Access Token (PAT) with `repo` admin scope. Used by the branch-protection workflow to call the GitHub API as an admin. Create at *Settings → Developer settings → Personal access tokens* and grant `repo` scope. |
| `CODECOV_TOKEN` | `ci.yml` | Upload token for [Codecov](https://codecov.io). Obtain from your Codecov project settings. Without this token, coverage uploads are anonymous and may be rate-limited; set `fail_ci_if_error: false` is already configured so missing this token will not break CI. |
| `STAGING_DEPLOY_TOKEN` | `deploy-staging.yml` | Credentials for the staging deployment platform (AWS, Fly.io, Heroku, etc.). Replace the placeholder `echo` step in `deploy-staging.yml` with the real deploy command once a platform is chosen. |
| `PRODUCTION_DEPLOY_TOKEN` | `deploy.yml` | Credentials for the production deployment platform. Replace the placeholder `echo` step in `deploy.yml` with the real deploy command once a platform is chosen. |

### Auto-provided by GitHub

| Name | Description |
|------|-------------|
| `GITHUB_TOKEN` | Scoped token automatically injected into every workflow run. Used by `deploy.yml` (`gh release create`) and `build-windows.yml` (electron-builder publish). No manual setup required. |

---

## Repository Variables

Variables are non-secret configuration values set in
**Settings → Secrets and variables → Actions → Variables**.

| Name | Required by | Description |
|------|------------|-------------|
| `STAGING_BASE_URL` | `deploy-staging.yml` | Base URL of the staging environment, e.g. `https://tickerpulse-staging.example.com`. Used by the smoke-test job to validate all six endpoints after each staging deploy. The smoke job will fail with a clear error message if this variable is not set. |
| `PRODUCTION_URL` | `deploy.yml` | Public URL of the production environment. Displayed as the environment URL in the GitHub Actions UI after a successful deploy. |

---

## Workflow → Secret mapping

```
ci.yml
  └── CODECOV_TOKEN              (optional, suppresses anonymous upload warnings)

deploy.yml
  ├── PRODUCTION_DEPLOY_TOKEN    (deploy-production job)
  └── GITHUB_TOKEN               (create-release job, auto-provided)

deploy-staging.yml
  ├── STAGING_DEPLOY_TOKEN       (deploy-staging job)
  └── vars.STAGING_BASE_URL      (deploy-staging + staging-smoke jobs)

apply-branch-protection.yml
  └── REPO_ADMIN_TOKEN           (apply job)

build-windows.yml
  └── GITHUB_TOKEN               (electron-builder publish, auto-provided)
```

---

## Security notes

- Never commit secret values to the repository. Always use the GitHub
  Secrets UI or the `gh secret set` CLI command.
- Rotate `REPO_ADMIN_TOKEN` whenever the owning GitHub account's PAT
  expires or that person leaves the project.
- `PRODUCTION_DEPLOY_TOKEN` and `STAGING_DEPLOY_TOKEN` should be scoped
  to the minimum permissions required by the deployment platform.