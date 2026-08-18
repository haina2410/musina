# Live Docker Deployment Design

## Goal

Give Musina one automatic, production-grade remote deployment by adapting the
working `shoe-web` staging pipeline. A push to `main` publishes a container to
GHCR and then asks Komodo to pull and deploy the updated stack.

The GitHub configuration keeps the existing `KOMODO_STAGING_*` names used by
`shoe-web`. In Musina those names identify the sole live environment; there is
no second production deployment or promotion workflow.

## Image publication

The existing multi-stage Dockerfile will name its final runtime stage `app`.
GitHub Actions will build that target for `linux/amd64` and publish it as:

```text
ghcr.io/haina2410/musina/app:<full commit SHA>
ghcr.io/haina2410/musina/app:latest
```

The full SHA provides an immutable release identifier. `latest` tracks the
newest successful build from `main` and is the default consumed by the live
stack. The workflow uses Buildx, GitHub Actions layer caching, GHCR login with
`GITHUB_TOKEN`, and package write permission. Manual dispatch may publish an
image, but only a push to `main` triggers deployment.

## Live stack

`docker-compose.yml` will define one service named `app` and default the
Compose project name to `musina`. It runs
`ghcr.io/haina2410/musina/app:${RELEASE_TAG:-latest}` and receives all runtime
configuration through the stack environment.

`DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are required during Compose
interpolation. `DISCORD_GUILD_ID` remains optional. The playback and logging
settings retain the application defaults already documented in `.env.example`.
The service has no published ports or persistent volumes. It runs with
`restart: unless-stopped`, a graceful stop window, and
`no-new-privileges:true`; process reaping remains the responsibility of the
image's existing `tini` entrypoint.

The stack defaults to `latest`, while an operator can set `RELEASE_TAG` to a
published full commit SHA for a pinned deployment or rollback.

## Deployment trigger

After image publication succeeds for a push to `main`, a dependent job invokes
`pandeptwidyaop/komodoactions@v1` with `pull-before-deploy: true` and these
repository settings:

- variable `KOMODO_STAGING_URL`
- variable `KOMODO_STAGING_STACK_NAME`
- secret `KOMODO_STAGING_API_KEY`
- secret `KOMODO_STAGING_API_SECRET`

Komodo owns the live runtime environment and points its stack at the committed
`docker-compose.yml`. A failed image build prevents deployment. A failed Komodo
pull or deploy fails the workflow visibly.

## Documentation

The README will describe the GHCR image, required GitHub settings, Komodo stack
configuration, optional `RELEASE_TAG` pinning, and the fact that this is the
only remote deployment despite the inherited `STAGING` setting names.

## Verification

The change is complete when:

- tests, lint, type checking, and the TypeScript build pass;
- Docker can build the named `app` target;
- Compose renders successfully with non-secret dummy Discord credentials;
- the workflow and Compose image names, target, tags, and Komodo setting names
  agree exactly;
- the committed changes are pushed to the current branch.

Production release promotion, a second environment, image cleanup, databases,
migrations, health endpoints, ports, and smoke-test containers are out of scope.
