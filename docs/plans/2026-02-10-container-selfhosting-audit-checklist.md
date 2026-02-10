# Containerization and Self-Hosting Audit Checklist

This checklist is the implementation artifact for epic #1155.

## Purpose

Keep runtime behavior, deployment workflow settings, and self-hosting docs aligned so users and operators do not get conflicting guidance.

## Audit Scope

- Compose runtime/security env parity across:
  - `docker-compose.yml` (root persist profile)
  - `deploy/docker-compose.persist.yml`
- Port configuration parity for `RACKULA_PORT`, `RACKULA_LISTEN_PORT`, and `RACKULA_API_PORT` defaults and wiring.
- Healthcheck consistency between compose variants for both frontend and API services.
- Container runtime hardening parity (non-root behavior, read-only FS, capability drops, and resource limits).
- Dev deploy workflow behavior in `.github/workflows/deploy-dev.yml`
- Operator-facing docs and examples:
  - `README.md`
  - `docs/guides/SELF-HOSTING.md`
  - `.env.example`
- Data directory ownership/permission requirements (UID 1001) documented consistently in operator docs and examples.

## Operational Checklist

- [ ] `docker-compose.yml` and `deploy/docker-compose.persist.yml` include equivalent persistence API security env semantics.
- [ ] `.github/workflows/deploy-dev.yml` persists required runtime env on host (`/opt/rackula/rackula-dev/.env`) before deploy.
- [ ] `deploy-dev.yml` uses permissions compatible with checkout (`contents: read`).
- [ ] `README.md` persistence setup instructions match current compose layout.
- [ ] `docs/guides/SELF-HOSTING.md` storage path examples match current folder-per-layout runtime format.
- [ ] `.env.example` includes the current runtime persistence/security variables with safe defaults and comments.
- [ ] Container resource limits (CPU/memory) remain intentional and consistent across deployment compose files.
- [ ] Base container image choices are documented in release/deploy docs (frontend nginx image and API Bun image).
- [ ] CI/CD includes image scanning and vulnerability review in release workflow.
- [ ] Non-root runtime expectations (UID 1001 for API data writes) are preserved and documented.
- [ ] CI includes a guard to detect compose persistence env drift:
  - Method: run `bash scripts/check-compose-persist-parity.sh` in CI.
  - Trigger: every test workflow run and PR touching compose/workflow/docs paths.
  - Failure behavior: missing required persistence env mappings exits non-zero and blocks merge.

## Linked Issues

- #1147
- #1151
- #1152
- #1153
- #1154
- #1155
