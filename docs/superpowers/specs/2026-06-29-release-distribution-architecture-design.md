# Release and distribution architecture: one pipeline, many channels

- Date: 2026-06-29
- Status: Decision
- Related: #2721 (CI runner migration), M018 (Cloudflare migration), M019 / #1995 (Unraid distribution)

## Question

Rackula ships through several channels: the hosted web app (prod and dev), an LXC container via Proxmox community-scripts, the Docker images self-hosters pull, and (planned) Unraid Community Apps and a Cloudflare Workers prod. Should all of these be driven from one release pipeline? If so, how much should be coupled?

## Decision

One pipeline owns the versioned artifacts and the gates, and it triggers downstream channel publishers. It does not contain those publishers in its critical path.

Concretely: one source of version truth (the CalVer tag) produces one gated build, which promotes by digest, which then fans out to independent, non-blocking channel publishers. A channel publisher can never fail or delay a prod promotion.

This is mostly the shape `release.yml` already has. The decision is to keep that shape deliberately and to add future channels as decoupled publishers rather than as new stages in the gated path.

## The three buckets

Every distribution concern falls into one of three buckets. The bucket determines the coupling.

### 1. Keep coupled: the things a release IS

The prod deployment artifact (the promoted Docker images) and the LXC tarball share build inputs and gate semantics. They are the release. They belong inside the gated stage to promote flow:

- Built once from the validated tag (immutable `:vX.Y.Z` tags, the LXC tarball plus its SHA256).
- Gated on real targets (Docker compose health, LXC smoke on a Proxmox CT).
- Promoted together by digest behind the single human-approval choke point.

This is correct today and stays.

### 2. Decouple: self-host packaging channels

Channels that only point at an already-promoted release (Unraid template XML per #1995; any future Flatpak or similar) must not sit in the gated path. An Unraid template bump builds nothing; it is a pointer update. If it were a release stage, a template-repo hiccup could block a prod promotion, which is backwards.

Model these as post-promote publishers:

- They run after `latest` flips, triggered by the release, not gating it.
- They are idempotent and re-runnable (an upsert, not a create).
- They auto-PR or push to the channel's own repo or registry.
- A publisher failure raises an alert and is retried; it never rolls back or blocks the release.

Drift between a channel and the latest release then becomes a converging publisher (re-run it) rather than a manual chore or a release-blocker.

### 3. Replacement, not addition: the prod hosting target

The Cloudflare Workers migration (M018) changes what the prod promote step deploys to: `wrangler deploy` instead of `docker compose` on the VPS. That is a swap of the existing `promote-prod` target, not a second parallel prod. Do not frame it as "Docker prod and Workers prod from one pipeline." Keeping hosting-target migration separate from distribution fan-out avoids conflating two unrelated changes.

## Why not one mega-pipeline

Centralizing every channel into the gated path couples failure domains that have nothing to do with each other. A template-XML lint error, a third-party registry outage, or a slow channel publish would all gain the power to block a prod promotion. The gated path should contain only what must be gated together: the artifacts whose correctness a release certifies. Everything downstream consumes a certified release and converges on its own.

## Current state

- `release.yml` already couples bucket 1 (Docker prod plus LXC tarball) correctly: one tag, parallel stage jobs, two gates, digest promotion behind approval.
- Bucket 2 has no automation yet. Unraid (M019 / #1995) is a research spike; there is no template repo and no publisher.
- Bucket 3 (M018) is in planning; `promote-prod` still targets the VPS.

## Target

- Keep bucket 1 as-is.
- When #1995 is actioned, add a post-promote Unraid publisher job (or scheduled sync) that upserts the template repo to the latest promoted release. It is triggered by the release, non-blocking, idempotent, and alert-on-failure.
- When M018 lands, swap `promote-prod`'s target; do not add a parallel prod.
- Add a lightweight cross-channel drift check (optional): a scheduled job that compares each channel's advertised version against the latest promoted release and opens an alert on mismatch. This replaces manual drift watching with a signal.

## Consequences

- The gated release path stays small and fast; its failure domain is only the artifacts it certifies.
- New channels are cheap to add and cannot destabilize releases.
- Drift is managed by re-runnable publishers and an optional drift check, not by hand.
- A channel can lag a release briefly (between promotion and the publisher completing); this is acceptable because self-host channels are pull-based and users are not mid-deploy.

## Follow-ups

- When #1995 is picked up, file the post-promote Unraid publisher as part of that work and link it here.
- Consider the cross-channel drift check as a small standalone issue once there are two or more decoupled channels.
