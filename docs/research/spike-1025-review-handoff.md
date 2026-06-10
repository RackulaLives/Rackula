# Handoff: Review the Cloudflare Frontend Hosting epic design (spike #1025)

You are reviewing a completed design, not implementing it. Read the artifacts, then critique
the design and spec: find gaps, wrong assumptions, or risky decisions. Two grounded
devil's-advocate passes have already run; your job is a fresh, independent third look.

## TL;DR

Spike #1025 ("evaluate rackula-api portability to Cloudflare Workers") was reframed by the user
into: host the Rackula PRODUCTION FRONTEND on Cloudflare Workers Static Assets to retire the
production Linode VPS tenant, preserving the Docker/LXC self-host story, with the backend
(rackula-api) explicitly OUT of scope. That work grew into an epic. The deliverable under review
is the epic design spec plus its supporting research.

## Where everything is

- Branch: `spike/1025-research` (git worktree at
  `/Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-1025`). The files below live
  in that worktree, not on `main`.
- Spec under review:
  `docs/superpowers/specs/2026-06-10-cloudflare-frontend-hosting-epic-design.md`
- Supporting research:
  - `docs/research/spike-1025-cf-frontend-hosting.md` (synthesised findings)
  - `docs/research/1025-codebase.md`, `1025-external.md`, `1025-patterns.md`,
    `1025-devils-advocate.md` (raw research)
- Checkpoint / decision log: `.claude/spike-1025-checkpoint.yaml`
- Commits: `89d408f4` (research + first spec), `997cbfc6` (spec revised after DA pass 2).

## Project context you need

- Rackula is a Svelte 5 + Vite SPA (no SvelteKit). `vite build` emits a static `dist/` with TWO
  HTML entries (`index.html`, `login.html`). Runtime API detection means prod already runs as a
  no-API static bundle today.
- Prod = `count.racku.la` (currently Linode VPS, Docker + nginx, static only). Dev = `d.racku.la`
  (currently on the VPS via the `vps-rackula` self-hosted runner, moving to the homelab per
  #1985). NOTE: docs that say "dev = GitHub Pages" are stale; there is no GitHub Pages workflow.
- The repo has a gated release pipeline (`release.yml`: validate -> stage -> gate -> promote-gate
  [prod Environment approval] -> promote-*). Prod deploys today via `deploy-prod.yml` on the
  `vps-rackula` runner.
- Solo maintainer. Governing constraint: ONE backend, not many. This is why R2/KV storage
  features are NOT built as bespoke Cloudflare Workers here; they are deferred to a future
  "rackula-api as a true single-contract API" epic.
- House writing style: no em dashes, no emoji, no bold in list items, be succinct.

## The design being reviewed

Epic (promote #1984 in place) "Cloudflare frontend hosting (prod -> Workers Static Assets)",
sibling of epic #1983 (eliminate the VPS), in a new milestone `M00 -- VPS Retirement &
Cloudflare Hosting`. Children:

- C1 (Large, atomic): prod cutover to Workers Static Assets. Hosting config, security-header
  re-home to a CF `_headers` file, full `deploy-prod.yml` rewrite off the `vps-rackula` runner,
  `wrangler versions` rollback, promote-DAG decouple, real fail-closed smoke test, the
  irreversible custom-domain attach (final step), and the rollback runbook.
- C2 (Trivial-Small): Cloudflare Web Analytics, build-flag-gated, self-host beacon-free.
- C3 (Small): Cloudflare dev/preview frontend env + cross-origin model to the homelab dev API.
- C4 (Small): self-host header/parity guard (CSP files agree, lxc-smoke-test asserts headers).

#1983 keeps #1985 (dev API -> homelab) and #1986 (decommission). All four issues move to M00.

## Decisions already made (with rationale) - do not relitigate unless you find them wrong

1. Platform = Cloudflare Workers Static Assets (committed per #1984).
2. Scope = frontend only; rackula-api hosting out of scope; R2/KV + true-API deferred to a future
   epic (solo-maintainer "one backend" constraint).
3. M00 ordering = milestone TITLE-sort (M00 sorts first; zero board config). This reconciles with
   the already-approved `docs/superpowers/specs/2026-06-08-milestone-sort-order-design.md`, which
   zero-pads titles and explicitly rejects Projects-v2 field workarounds. (An earlier "use a
   Priority field" decision was reversed after a DA pass found this contradiction.)
4. C1 kept atomic but re-labelled Large; the custom-domain attach is the final gated step.
5. version.json: separate CF build + post-deploy version AND commit assertion; APP_COMMIT
   build-arg added to the self-host Docker build for parity (self-host ships commit="" today
   because .dockerignore strips .git).
6. Rollback window = hold the VPS prod container running until 1 green CF release, then #1986 may
   proceed.
7. Tokens split: prod token (behind promote-gate) vs dev/preview token (dev Worker only, never
   exposed to fork PRs).
8. Cloudflare account/zone co-ownership: confirmed same account (user-confirmed).

## What the two devil's-advocate passes already caught and folded

Pass 1 (on the design): rollback was a fiction (deploy path overwritten); promote DAG couples
prod to Docker/LXC gates; dist provenance / un-gated second build; smoke test was hollow
(version.json passes on a half-uploaded SPA-fallback deploy); login.html drop needed a build
seam; analytics had no seam (gate on token presence, not PROD); CSP lives in THREE files
(CF + Docker + LXC) and already drifts; a second CSP hash has unknown origin; epic mechanics
(M00 sort, #1984 promotion rewrites #1983, #1986 says "Vultr" not "Linode", #1025 open but
referenced as closed).

Pass 2 (on the written spec): `_headers` source-file location (must be injected in the wrangler
step, not committed to `static/`, or it leaks into self-host); `workers.dev` subdomain is an
unstated prereq; apex/MX/SPF DNS blast radius; the Projects "roadmap" view is a Status-grouped
board where a Priority sort cannot float a global top (drove decision 3); `environment: prod`
double-approval; `promote-github` ordering; DRackula dev cue is hostname-coupled and breaks on
`workers.dev`; first-cutover bootstrap vs steady-state; preview workflow fork-PR token exposure.

All of the above are folded into the current spec.

## Open items / out-of-band prerequisites (not yet done)

- Register the account `*.workers.dev` subdomain (one-time, dashboard).
- Provision least-privilege CF API tokens (split prod vs dev/preview).
- The unknown second CSP hash (`sha256-yei5Fza...`) still needs the build-and-grep investigation
  before `script-src` can be tightened to `'self'`; the plan must handle the case where it
  cannot.
- The GitHub epic restructure (create M00, promote #1984, rewrite #1983, create C1-C4, move
  issues, close #1025, fix #1986 title) has NOT been executed yet.
- No implementation has started. #1025 is still OPEN.

## What to scrutinise (reviewer asks)

1. Is C1 too large to execute as one atomic PR even though the "no headerless prod window"
   argument is sound? Is there a safer decomposition that still avoids a headerless window?
2. The separate-CF-build decision breaks "promote exactly what was gated". Is the version+commit
   assertion a sufficient compensating control, or should the gated Docker image's `dist/` be the
   prod artifact instead?
3. Cutover/rollback: is "hold the VPS container for 1 green release" actually enough margin? Is
   the irreversible custom-domain attach adequately de-risked by the workers.dev validation?
4. Self-host blast radius: are there shared-source edits (CSP, `static/404.html`, `login.html`,
   robots, `_headers`) that could still silently break the Docker/LXC build? Is C4's parity guard
   sufficient?
5. Anything the two DA passes and the spec still miss: CF billing at the full footprint, E2E/test
   configs that reference the URLs, security of the preview workflow, or epic-mechanics edge
   cases.

## Next step (not yet taken)

Per the brainstorming flow, the next step is the writing-plans skill to produce the execution
plan (epic restructure + C1). The user is deciding between "plan first" and "execute the GitHub
restructure first, then plan C1". Your review should land before either.
