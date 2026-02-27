# Required Secrets & Variables

This document is the canonical reference for all secrets, environment variables, and
repository variables required to run the TickerPulse AI CI/CD pipeline.

Keep this document up-to-date whenever a workflow file changes.

---

## GitHub Actions Secrets

Configure these in **Settings → Secrets and variables → Actions → Secrets**.

### Production Deployment (`deploy.yml`)

| Secret | Description | Example |
|--------|-------------|---------|
| `DEPLOY_HOST` | Hostname or IP address of the production server | `prod.example.com` |
| `DEPLOY_USER` | SSH username used to connect to the production server | `deploy` |
| `DEPLOY_KEY` | Private SSH key (RSA or Ed25519) for production server access | `-----BEGIN OPENSSH PRIVATE KEY-----…` |
| `DEPLOY_PATH` | Absolute path to the Docker Compose project on the production server | `/srv/tickerpulse` |

### Staging Deployment (`deploy-staging.yml`)

| Secret | Description | Example |
|--------|-------------|---------|
| `STAGING_HOST` | Hostname or IP address of the staging server | `staging.example.com` |
| `STAGING_SSH_USER` | SSH username used to connect to the staging server | `deploy` |
| `STAGING_SSH_KEY` | Private SSH key (RSA or Ed25519) for staging server access | `-----BEGIN OPENSSH PRIVATE KEY-----…` |
| `STAGING_DEPLOY_PATH` | Absolute path to the Docker Compose project on the staging server | `/srv/tickerpulse-staging` |

### Auto-Provided by GitHub Actions

These are injected automatically and require no manual setup:

| Secret | Used by | Description |
|--------|---------|-------------|
| `GITHUB_TOKEN` | All workflows | Authenticates GHCR image push and GitHub API calls |

---

## GitHub Actions Repository Variables

Configure these in **Settings → Secrets and variables → Actions → Variables**.

| Variable | Used by | Description | Example |
|----------|---------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | `deploy.yml` | Backend API URL baked into the frontend Docker image at build time | `https://api.tickerpulse.io` |

---

## Server-Side Environment Variables

These are **not** GitHub Actions secrets. They must be present on the deployment
target — typically in a `.env` file alongside `docker-compose.yml`, or injected
via a secrets manager.

### Backend (`backend/`)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SECRET_KEY` | Yes (prod) | Flask session secret — must be changed from the dev default in production | `tickerpulse-dev-key-change-in-prod` |
| `DB_PATH` | No | Absolute path to the SQLite database file | `stock_news.db` |
| `FLASK_PORT` | No | Port Flask listens on inside the container | `5000` |
| `FLASK_DEBUG` | No | Enable debug mode (`true`/`false`) — must be `false` in production | `false` |
| `CORS_ORIGINS` | No | Comma-separated list of allowed CORS origins | `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | No* | Anthropic Claude API key for AI rating features | — |
| `OPENAI_API_KEY` | No* | OpenAI API key for AI rating features | — |
| `GOOGLE_AI_KEY` | No* | Google AI API key for AI rating features | — |
| `XAI_API_KEY` | No* | xAI Grok API key for AI rating features | — |

\* At least one AI provider key is required for AI-powered features to function.

---

## Branch Protection Setup (One-Time)

Branch protection rules in `.github/branch-protection-config.json` are **not**
applied automatically by any workflow. A repository administrator must apply them
once using the GitHub API or the GitHub UI.

### Via GitHub CLI

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --input .github/branch-protection-config.json
```

Replace `{owner}/{repo}` with the actual repository path (e.g., `acme/tickerpulse-ai`).

### Via GitHub UI

**Settings → Branches → Add branch protection rule**, then set:

- **Branch name pattern:** `main`
- **Require status checks to pass before merging:** enabled
  - Required checks: `backend-test`, `frontend-test`, `electron-type-check`
  - **Require branches to be up to date before merging:** enabled
- **Require a pull request before merging:** enabled
  - **Required approving reviews:** 1
  - **Dismiss stale reviews when new commits are pushed:** enabled
  - **Require review from Code Owners:** enabled
- **Do not allow bypassing the above settings:** enabled
- **Allow force pushes:** disabled
- **Allow deletions:** disabled

---

## Secret Rotation

| Secret | Rotation cadence | Action required |
|--------|-----------------|-----------------|
| `DEPLOY_KEY` / `STAGING_SSH_KEY` | Annually, or immediately on compromise | Update GitHub Actions secret and `~/.ssh/authorized_keys` on the server |
| AI API keys (`ANTHROPIC_API_KEY`, etc.) | Per-provider policy | Update the server-side `.env` file and restart the backend container |
| `SECRET_KEY` (Flask) | On compromise or team change | Rotation invalidates active sessions — schedule during low-traffic window |