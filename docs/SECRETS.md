```markdown
# CI/CD Secrets & Repository Variables

This document inventories all secrets and variables required for TickerPulse AI CI/CD pipelines.

## Repository Secrets

Secrets are sensitive credentials stored in GitHub (Settings > Secrets and variables > Actions).

| Secret | Purpose | Used In | Notes |
|--------|---------|---------|-------|
| **REPO_ADMIN_TOKEN** | GitHub API token for branch protection workflow | `apply-branch-protection.yml` | Must have `admin:repo_hook` scope for branch protection rules |
| **CODECOV_TOKEN** | Authentication for Codecov coverage reporting | `ci.yml` | Used by `codecov/codecov-action` for backend & frontend coverage uploads |
| **STAGING_HOST** | Hostname/IP of staging SSH deployment target | `deploy-staging.yml` | Example: `staging.example.com` |
| **STAGING_SSH_USER** | SSH username for staging deployment | `deploy-staging.yml` | Example: `deploy-user` |
| **STAGING_SSH_KEY** | SSH private key for staging authentication | `deploy-staging.yml` | Must be in PEM format without passphrase |
| **STAGING_DEPLOY_PATH** | Deployment directory path on staging server | `deploy-staging.yml` | Example: `/opt/tickerpulse/staging` |
| **DEPLOY_HOST** | Hostname/IP of production SSH deployment target | `deploy.yml` | Example: `prod.example.com` |
| **DEPLOY_USER** | SSH username for production deployment | `deploy.yml` | Example: `deploy-user` |
| **DEPLOY_KEY** | SSH private key for production authentication | `deploy.yml` | Must be in PEM format without passphrase |
| **DEPLOY_PATH** | Deployment directory path on production server | `deploy.yml` | Example: `/opt/tickerpulse/production` |

## Repository Variables

Variables are non-sensitive configuration stored in GitHub (Settings > Secrets and variables > Actions).

| Variable | Purpose | Used In | Notes |
|----------|---------|---------|-------|
| **STAGING_BASE_URL** | Base URL for staging environment smoke tests | `deploy-staging.yml` | Example: `https://staging.example.com` — enables dynamic endpoint validation |
| **NEXT_PUBLIC_API_URL** | Frontend environment variable for API endpoint | `deploy.yml`, `deploy-staging.yml` | Example: `https://api.example.com` — passed as a `vars.*` GitHub Actions variable, not a secret, so the frontend image bakes in the correct origin at build time |

## Setup Instructions

### 1. Create Repository Secrets

```bash
# For staging deployment
gh secret set STAGING_HOST --body "staging.example.com"
gh secret set STAGING_SSH_USER --body "deploy-user"
gh secret set STAGING_SSH_KEY < ~/.ssh/staging_key
gh secret set STAGING_DEPLOY_PATH --body "/opt/tickerpulse/staging"

# For production deployment
gh secret set DEPLOY_HOST --body "prod.example.com"
gh secret set DEPLOY_USER --body "deploy-user"
gh secret set DEPLOY_KEY < ~/.ssh/prod_key
gh secret set DEPLOY_PATH --body "/opt/tickerpulse/production"

# For CI/CD integrations
gh secret set REPO_ADMIN_TOKEN --body "<token>"
gh secret set CODECOV_TOKEN --body "<token>"
```

### 2. Create Repository Variables

```bash
gh variable set STAGING_BASE_URL --body "https://staging.example.com"
gh variable set NEXT_PUBLIC_API_URL --body "https://api.staging.example.com"
```

### 3. Generate SSH Keys (Recommended)

```bash
# Staging key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/staging_key -N ""

# Production key (use different key for security)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/prod_key -N ""

# Deploy public keys to target servers
ssh-copy-id -i ~/.ssh/staging_key deploy-user@staging.example.com
ssh-copy-id -i ~/.ssh/prod_key deploy-user@prod.example.com
```

## Validation

Incomplete secrets configuration will cause pipeline failures:

1. **Branch Protection Workflow** (`apply-branch-protection.yml`) — requires `REPO_ADMIN_TOKEN`
2. **Staging Deployment** (`deploy-staging.yml`) — requires `STAGING_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_DEPLOY_PATH`, `STAGING_BASE_URL`
3. **Production Deployment** (`deploy.yml`) — requires `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH`, `NEXT_PUBLIC_API_URL`
4. **Coverage Reporting** (`ci.yml`) — requires `CODECOV_TOKEN`

All secrets must be created in GitHub repository settings before running workflows.
```