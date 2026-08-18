# Live Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Musina's container to GHCR on every `main` push and redeploy its sole live Komodo stack through the inherited staging credentials.

**Architecture:** The existing Dockerfile exposes a named `app` runtime target. A committed Compose file defines the live bot service, while one GitHub Actions workflow builds and pushes immutable/full-SHA and moving/latest tags before calling Komodo.

**Tech Stack:** Docker Buildx, Docker Compose, GitHub Actions, GHCR, Komodo

## Global Constraints

- `KOMODO_STAGING_*` names identify Musina's sole live environment.
- Publish `ghcr.io/haina2410/musina/app` for `linux/amd64` with full-SHA and `latest` tags.
- Only successful image publication from a push to `main` may trigger deployment.
- Do not add production promotion, a second environment, databases, migrations, ports, or smoke containers.

---

### Task 1: Define and verify the live container deployment

**Files:**
- Modify: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.github/workflows/publish-images.yml`
- Modify: `.dockerignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing `Dockerfile`, `.env.example`, npm validation commands, and the four `KOMODO_STAGING_*` repository settings.
- Produces: Docker target `app`, image `ghcr.io/haina2410/musina/app`, Compose service `app`, and automatic Komodo deployment after successful publication.

- [x] **Step 1: Verify the deployment artifacts are absent**

Run:

```bash
docker build --target app -t musina:deployment-check .
DISCORD_TOKEN=dummy DISCORD_CLIENT_ID=dummy docker compose config --quiet
```

Expected: both commands fail because the named runtime target and Compose file
do not exist. These are executable configuration checks, not source-text tests.

- [x] **Step 2: Implement the deployment files**

Name the final Docker stage `app`. Add `docker-compose.yml` with the GHCR image, required Discord credentials, optional application settings, restart/graceful-stop/security policies, and no ports or volumes. Add the shoe-web-derived publish/deploy workflow with one image target. Exclude `.github`, local test artifacts, and design working files from Docker build context.

- [x] **Step 3: Document live deployment operations**

Extend `README.md` with the sole-live-environment semantics, GitHub variable and secret names, Komodo's `docker-compose.yml` stack source, automatic `main` deployment, and `RELEASE_TAG` pin/rollback behavior.

- [x] **Step 4: Run the repository checks**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [x] **Step 5: Validate required variables and render Compose**

Run:

```bash
COMPOSE_DISABLE_ENV_FILE=1 env -u DISCORD_TOKEN -u DISCORD_CLIENT_ID docker compose config --quiet
COMPOSE_DISABLE_ENV_FILE=1 DISCORD_TOKEN=dummy DISCORD_CLIENT_ID=dummy docker compose config --quiet
```

Expected: the first command fails naming `DISCORD_TOKEN`; the second exits 0
without exposing real credentials.

- [x] **Step 6: Validate the workflow and build the runtime image target**

Run:

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7
docker build --target app -t musina:deployment-check .
```

Expected: the workflow is valid; the build exits 0 and produces a locally
tagged image containing the compiled bot, FFmpeg, `yt-dlp`, and `tini`.

- [x] **Step 7: Commit and push**

```bash
git add Dockerfile .dockerignore docker-compose.yml .github/workflows/publish-images.yml README.md docs/superpowers/plans/2026-08-18-live-docker-deployment.md
git commit -m "Deploy Musina through Komodo"
git push origin HEAD
```
