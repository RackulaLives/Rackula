# Spike #1995 - Pattern Analysis & Synthesis (Rackula on Unraid)

**Date:** 2026-06-08 **Purpose:** Synthesis pass over `1995-codebase.md` and `1995-external.md`, applying a SECURE-CODING lens and a DEVIL'S-ADVOCATE lens, to feed implementation issue #1317. **Decided direction (not re-litigated here):** Community Applications (CA) Docker template; native Plugin (.plg) rejected.

---

## Key Insights

Distilled from the two research files, the facts that actually drive the #1317 design:

1. CA installs exactly one container per template. There is no Compose/stack primitive in stock CA: an app needing N containers is N independent templates installed in sequence (`1995-external.md` section 1, section 3). This single-container-per-template rule is the pivot the whole distribution model turns on.

2. The API is genuinely optional. The frontend nginx image (`nginxinc/nginx-unprivileged`, port 8080, UID 101) is fully functional standalone with `RACKULA_AUTH_MODE=none` and no volume. Persistence and auth require the Bun API sidecar (port 3001, UID 1001, `/data` volume) (`1995-codebase.md` frontend/API sections, Open Question #1). This maps cleanly to the ecosystem's two-template "optional second container" pattern (Homelabarr/KitchenOwl-split, `1995-external.md` section 3).

3. Frontend-only with no volume is silently ephemeral, but for a different reason than most apps. Rackula's primary persistence is actually the browser (the SPA works without any backend). The API adds _server-side_ shared persistence. So "frontend only" is not "data lost on restart" for the casual single-browser user; it is "no server-side storage, no cross-device sync, no auth." This nuance matters for the devil's-advocate section: the "my layouts don't save" failure mode is real but narrower than the codebase doc's blunt "all data lost on restart" framing implies.

4. Auth is opt-in and fails closed when misconfigured. Default is `none` (anonymous read/write). When `RACKULA_AUTH_MODE != none`, the API _refuses to start_ without `RACKULA_AUTH_SESSION_SECRET` (32+ chars); `local` additionally requires username and a 12+ char password (Argon2id, OWASP params, plaintext scrubbed from env after bootstrap, login rate-limited 5/60s, timing-safe compare). CSRF protection and Secure cookies turn on automatically when auth is enabled (`1995-codebase.md` auth sections). The security model is already solid; the Unraid risk is almost entirely in _how the template surfaces these knobs_, not in the app code.

5. The reverse-proxy story is a documentation problem, not a code problem. `RACKULA_TRUST_PROXY` already exists to honour `X-Forwarded-Proto` behind SWAG/NPM (the two dominant Unraid proxies, both nginx-based). No Unraid-specific code change is needed; the template just needs to expose the flag as an advanced variable and the support thread must explain when to flip it (`1995-external.md` section 4).

6. Plugin path is definitively wrong and the research closes it. A `.plg` gets full host filesystem access, must survive every Unraid OS upgrade, and carries a higher trust bar for zero packaging benefit on an app that already ships as a container (`1995-external.md` section 5). Not reopened here.

7. The real friction is human, not technical. CA submission requires a self-hosted template repo (`Owner/unraid-templates`), an Unraid _forum support thread_, and passes through a volunteer moderation review (days to weeks) with an explicit account-quality screen: "made by a user with previous activity on GitHub... attributed to a GitHub account with an active history... not fully AI written" (`1995-external.md` section 1). Whether RackulaLives has a usable Unraid _forum_ account is an open prerequisite (see Recommendation summary).

---

## Recommended distribution model

**CA Docker template, two-template approach.** Ship two independent CA templates plus a self-hosted template repo, an icon, and a forum support thread.

### Template 1: `rackula` (frontend, always installed)

- Image: `ghcr.io/rackulalives/rackula` (pin a tag, see secure-coding lens)
- Exposes:
  - Port `8080/tcp` (container) -> suggested host `8080`, drives the WebUI button
  - `RACKULA_AUTH_MODE` dropdown (`none|local|oidc`), default `none`, basic visibility
  - `RACKULA_STORAGE_MODE` dropdown (`browser|server`), default `browser`; set `server` when the `rackula-api` container is installed (#2036)
  - `API_HOST` / `API_PORT` (advanced) so a persistence user can point the frontend at the API container by name/IP
  - `RACKULA_TRUST_PROXY` (advanced, default `false`) for SWAG/NPM users
  - `API_WRITE_TOKEN` (advanced, `Mask="true"`) when wiring writes to the API (the frontend's env var is `API_WRITE_TOKEN`; it must match `RACKULA_API_WRITE_TOKEN` on the API container)
- No volume. Frontend is stateless.
- Overview text must state: persistence/auth need the separate `rackula-api` container; without it, layouts live only in the browser.

### Template 2: `rackula-api` (optional, for persistence/auth/OIDC)

- Image: `ghcr.io/rackulalives/rackula-api` (pinned tag)
- Exposes:
  - Port `3001/tcp` (advanced; only needed if frontend reaches it across networks; normally the two share a Docker network and talk by container name)
  - Path `/data` -> default host `/mnt/user/appdata/rackula`, `Mode="rw"`, `Required="true"`
  - `RACKULA_AUTH_MODE` dropdown (`none|local|oidc`), default `none`
  - `RACKULA_AUTH_SESSION_SECRET` (`Mask="true"`, no baked default; required when auth != none)
  - `RACKULA_LOCAL_USERNAME` / `RACKULA_LOCAL_PASSWORD` (the password `Mask="true"`; shown when mode=local)
  - `RACKULA_API_WRITE_TOKEN` (`Mask="true"`, advanced)
  - OIDC provider settings (advanced; flagged as under-documented, see open questions)
- `<Requires>` text: "Pair with the Rackula frontend container."

### Self-hosted template repo

`RackulaLives/unraid-templates` holding `rackula.xml` and `rackula-api.xml`, each with a `<TemplateURL>` pointing at its own raw GitHub URL so CA can fetch template updates (`1995-external.md` section 1-2). This is the modern recommended path; the shared `selfhosters/unRAID-CA-templates` request repo has announced a slow-down and now steers new apps to their own repos.

### Icon hosting

Direct HTTPS link to a square PNG, e.g. `https://raw.githubusercontent.com/RackulaLives/Rackula/main/static/icon.png` (must be https, must be PNG, `1995-external.md` section 2). Confirm such a PNG exists at a stable path (the codebase doc references icon files but not a confirmed square PNG asset).

### Support thread

One Unraid forum thread covering both containers; its URL goes in each template's `<Support>`.

### The common case stays trivial

Install `rackula`, accept defaults (`auth_mode=none`, no volume), click Apply, open the WebUI. One container, zero secrets, one-click. The two-template complexity only appears for users who deliberately want server-side persistence or auth.

### Annotated XML skeleton: `rackula` (frontend, full)

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>rackula</Name>
  <Repository>ghcr.io/rackulalives/rackula:26.6.0</Repository><!-- pin, not :latest -->
  <Registry>https://github.com/RackulaLives/Rackula/pkgs/container/rackula</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://forums.unraid.net/topic/XXXXXX-support-rackula/</Support>
  <Project>https://github.com/RackulaLives/Rackula</Project>
  <Overview>Rackula is a rack layout designer for homelabbers. This container serves the
    web frontend and works on its own for a single browser. For server-side persistence,
    cross-device storage, or login (local/OIDC), also install the optional "rackula-api"
    container and point API Host at it. Default auth is "none" - safe on a trusted LAN,
    do NOT expose this to the internet without enabling auth.</Overview>
  <Category>Productivity: Tools:Utilities:</Category>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <Icon>https://raw.githubusercontent.com/RackulaLives/Rackula/main/static/icon.png</Icon>
  <TemplateURL>https://raw.githubusercontent.com/RackulaLives/unraid-templates/main/rackula.xml</TemplateURL>
  <ExtraParams>--restart unless-stopped</ExtraParams>

  <Config Name="WebUI Port" Target="8080" Default="8080" Mode="tcp"
          Type="Port" Display="always" Required="true" Mask="false"
          Description="Host port for the Rackula web interface."/>

  <Config Name="Auth Mode" Target="RACKULA_AUTH_MODE" Default="none|local|oidc"
          Type="Variable" Display="always" Required="false" Mask="false"
          Description="none = anonymous (trusted LAN only). local = username/password.
            oidc = external identity provider. Auth is enforced by the rackula-api
            container; this setting must match it."/>

  <Config Name="Storage Mode" Target="RACKULA_STORAGE_MODE" Default="browser|server"
          Type="Variable" Display="always" Required="false" Mask="false"
          Description="browser = layouts stay in this browser only. server = layouts are
            saved by the rackula-api container. Set to server when you install
            rackula-api, and point API Host at it."/>

  <Config Name="API Host" Target="API_HOST" Default="rackula-api"
          Type="Variable" Display="advanced" Required="false" Mask="false"
          Description="Container name or IP of the rackula-api container. Only needed if
            you installed the API for persistence/auth."/>

  <Config Name="API Port" Target="API_PORT" Default="3001"
          Type="Variable" Display="advanced" Required="false" Mask="false"
          Description="Port the rackula-api container listens on (default 3001)."/>

  <Config Name="Trust Proxy" Target="RACKULA_TRUST_PROXY" Default="false|true"
          Type="Variable" Display="advanced" Required="false" Mask="false"
          Description="Set true ONLY when Rackula sits behind a reverse proxy (SWAG, NPM,
            Traefik) that terminates HTTPS. Lets secure cookies and redirects use https."/>

  <Config Name="API Write Token" Target="API_WRITE_TOKEN" Default=""
          Type="Variable" Display="advanced" Required="false" Mask="true"
          Description="Optional bearer token nginx injects on write requests to the API.
            Must match RACKULA_API_WRITE_TOKEN on the rackula-api container."/>
</Container>
```

### Annotated XML skeleton: `rackula-api` (optional)

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>rackula-api</Name>
  <Repository>ghcr.io/rackulalives/rackula-api:26.6.0</Repository><!-- pin, not :latest -->
  <Registry>https://github.com/RackulaLives/Rackula/pkgs/container/rackula-api</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://forums.unraid.net/topic/XXXXXX-support-rackula/</Support>
  <Project>https://github.com/RackulaLives/Rackula</Project>
  <Overview>Optional persistence and auth backend for Rackula. Stores layouts and assets in
    /data and provides local/OIDC login. Install this alongside the "rackula" frontend and
    point the frontend's API Host at this container. Not needed for single-browser use.</Overview>
  <Requires>Install the "rackula" frontend container too, set its API Host to this
    container's name, and set its Storage Mode to server.</Requires>
  <Category>Productivity: Tools:Utilities:</Category>
  <Icon>https://raw.githubusercontent.com/RackulaLives/Rackula/main/static/icon.png</Icon>
  <TemplateURL>https://raw.githubusercontent.com/RackulaLives/unraid-templates/main/rackula-api.xml</TemplateURL>
  <ExtraParams>--restart unless-stopped</ExtraParams>

  <!-- Data volume: a proper appdata location, so Required=true (src 7 guidance) -->
  <Config Name="Data" Target="/data" Default="/mnt/user/appdata/rackula" Mode="rw"
          Type="Path" Display="always" Required="true" Mask="false"
          Description="Where Rackula stores layouts and uploaded assets."/>

  <!-- Port only needed for cross-network access; usually container-to-container by name -->
  <Config Name="API Port" Target="3001" Default="3001" Mode="tcp"
          Type="Port" Display="advanced" Required="false" Mask="false"
          Description="Only publish this if the frontend reaches the API across networks.
            On a shared Docker network you do NOT need to expose it to the host."/>

  <Config Name="Auth Mode" Target="RACKULA_AUTH_MODE" Default="none|local|oidc"
          Type="Variable" Display="always" Required="false" Mask="false"
          Description="Must match the frontend's Auth Mode."/>

  <Config Name="Session Secret" Target="RACKULA_AUTH_SESSION_SECRET" Default=""
          Type="Variable" Display="always" Required="false" Mask="true"
          Description="REQUIRED when Auth Mode is local or oidc. Generate 32+ random
            characters, e.g. `openssl rand -base64 48`. Leave blank only for auth=none.
            The API will refuse to start with auth enabled and no secret."/>

  <Config Name="Local Username" Target="RACKULA_LOCAL_USERNAME" Default=""
          Type="Variable" Display="advanced" Required="false" Mask="false"
          Description="Login username. Required only when Auth Mode is local."/>

  <Config Name="Local Password" Target="RACKULA_LOCAL_PASSWORD" Default=""
          Type="Variable" Display="advanced" Required="false" Mask="true"
          Description="Login password, 12+ chars. Required only when Auth Mode is local.
            Hashed at startup; not stored in plaintext after boot."/>

  <Config Name="API Write Token" Target="RACKULA_API_WRITE_TOKEN" Default=""
          Type="Variable" Display="advanced" Required="false" Mask="true"
          Description="Optional bearer token guarding PUT/DELETE when not using session auth.
            Must match API Write Token on the frontend."/>
</Container>
```

Note: with `auth=none`, the `rackula-api` install is also one-click after setting the data path: dropdowns default to `none`, secret stays blank, persistence "just works." The secret and credential fields only become load-bearing when the user chooses `local`/`oidc`.

---

## Approaches considered & trade-offs

| Approach | Pros | Cons | When it'd be right |
| --- | --- | --- | --- |
| **(A) Frontend-only single template + docs** | Simplest possible CA listing; one template to maintain; one-click; zero secrets in the common path | Persistence/auth is "go read a compose file" - hostile to point-and-click Unraid users; no in-CA way to add the API | If the API were experimental/rare, or if browser-only storage were the only intended model |
| **(B) Two templates [RECOMMENDED]** | Matches CA's one-container rule and the proven Homelabarr/KitchenOwl-split pattern; common case stays one-click; persistence is still installable from the Apps tab; reuses existing images unchanged | Two listings to maintain; risk of "installed frontend, no persistence" confusion (addressed in devil's-advocate); user must wire `API_HOST` | The actual Rackula shape: an always-needed frontend + a genuinely optional backend |
| **(C) One combined fat image** | True one-click persistence with zero wiring; single template | Requires building/shipping a NEW image (s6/supervisor running nginx + Bun together) that does not exist today; doubles the build/security/patch surface; bakes the API in even for users who do not want it; contradicts the project's "simplicity first / only build what's asked" philosophy | Only if zero-config persistence were the default desired experience. It is not - the API is explicitly optional, so C is solving a problem we do not have |
| **(D) Plugin (.plg)** | Deep OS integration; could auto-manage everything | Full host filesystem access for a web app (huge attack surface); must survive every Unraid OS upgrade; higher trust/moderation bar; Unraid-only; re-implements install/upgrade the container runtime already gives us | Never, for this app. Reserved for hardware/driver/OS-level features Rackula does not have |

**Concrete rejection of (C):** there is no combined image in the repo. Choosing C means a net-new Dockerfile running two runtimes under a process supervisor, a third image to publish on every release, and a larger CVE/patch surface, all to avoid one extra "Apps" click. The codebase already cleanly separates the two concerns (separate Dockerfiles, separate users, separate healthchecks). Merging them is more code for less isolation.

**Concrete rejection of (D):** `1995-external.md` section 5 is decisive. The official Unraid guidance is "use Docker whenever you can; reserve plugins for features that need direct OS/WebGUI integration." Rackula is already a self-contained container. A plugin would hand a web-facing app root-level host access for zero benefit and add an open-ended OS-upgrade maintenance liability.

---

## SECURE-CODING lens

Specific to this app on Unraid. Each item gives a concrete template/AC requirement, not generic advice.

### 1. Auth defaults: shipping `auth_mode=none` on a LAN appliance

**Verdict: acceptable as a default, but ONLY with explicit guardrail text.** Unraid's threat model is a trusted LAN where the user opts into exposure. Rackula's `none` mode = anonymous read AND write to the API. On an isolated LAN with no port-forward, that matches the homelab norm (the LXC distribution already ships `none` by default, `1995-codebase.md`). The danger is the user who later port-forwards 8080 or puts it on a public reverse proxy without flipping auth on. That turns an unauthenticated _write_ API (create/delete layouts, upload assets) onto the internet.

**Template/AC must enforce:**

- Frontend `<Overview>` and the support thread state plainly: "Default auth is none. Safe on a trusted LAN. Do NOT expose Rackula to the internet without setting Auth Mode to local or oidc."
- The `RACKULA_AUTH_MODE` Description repeats the "trusted LAN only" caveat (already in the skeleton above).
- Do not market a "publish to the internet" path anywhere without auth in the same breath.

### 2. Secrets handling: `RACKULA_AUTH_SESSION_SECRET` and friends

**Critical Unraid-specific fact:** Unraid persists template values as plaintext XML under `/boot/config/plugins/dockerMan/templates-user` (`1995-external.md` section 1) and shows variable values in the Edit Container UI. A secret typed into a normal Variable is visible on screen and on the flash drive.

**Template/AC must enforce:**

- `RACKULA_AUTH_SESSION_SECRET` -> `Mask="true"` (hides it behind asterisks in the UI). This does not encrypt the on-disk XML, but it prevents shoulder-surf/screenshot leakage, which is the realistic Unraid exposure.
- `RACKULA_LOCAL_PASSWORD` -> `Mask="true"`.
- `RACKULA_API_WRITE_TOKEN` (both containers) -> `Mask="true"`.
- `RACKULA_LOCAL_USERNAME` is not a secret -> leave unmasked.
- No baked default for the session secret, the password, or the write token. A shipped default secret would let anyone forge a valid HS256 session cookie against every default install on earth. The app already requires the operator to supply it (the API refuses to start with auth enabled and no secret), so the template must NOT paper over that with a `Default=`. Leave `Default=""` and document `openssl rand -base64 48`.
- Document that values live in plaintext on `/boot/config`, so the secret should be treated as flash-drive-readable and rotated via `RACKULA_AUTH_SESSION_GENERATION` if the flash is ever compromised.

### 3. Write protection: `RACKULA_API_WRITE_TOKEN` / admin-role PUT/DELETE

The API guards writes two ways: when auth is enabled, all PUT/DELETE require the admin session role; independently, an optional `RACKULA_API_WRITE_TOKEN` lets nginx inject a bearer on writes (`1995-codebase.md` write-route sections). The footgun is a persistence user on `auth=none` who wants reads-anonymous-but-writes-protected and does not realise neither protection is on by default.

**Template/AC must enforce:**

- Expose `RACKULA_API_WRITE_TOKEN` (api) and `API_WRITE_TOKEN` (frontend) as advanced, masked, with Description: "set the SAME value on both containers to require a token for create/delete."
- Make explicit in docs: `auth=none` + no write token = fully open read/write. That is fine for a single-user isolated LAN and is the intended trivial path, but it is the exact config that must never be internet-exposed.
- Do NOT auto-bake a write token default in the template (same reasoning as the secret: a shared default token is no protection). If auto-generation is wanted, it belongs in install tooling that produces a _unique random_ value, not a static template `Default=`.

### 4. Reverse proxy / cookies: Secure-cookie + `RACKULA_TRUST_PROXY`

The proxy terminates TLS and talks HTTP to the container; the app reads `X-Forwarded-Proto` only when `RACKULA_TRUST_PROXY=1` (`1995-external.md` section 4). Cookie `Secure` is forced on in prod and whenever `SameSite=None`. The breakage modes:

- Auth enabled + plain HTTP + `TRUST_PROXY=0`: Secure cookies are set, browser refuses to send them back over HTTP, login appears to "not work" (infinite redirect to login). This is a support magnet.
- `TRUST_PROXY=1` set when NOT behind a trusted proxy: the app would trust a client-spoofable `X-Forwarded-Proto`, a (minor) downgrade/redirect risk.

**Template/AC must enforce:**

- Default `RACKULA_TRUST_PROXY=false` (correct for LAN-direct). Keep it advanced so casual users never touch it.
- Support thread documents the two-line rule: "Behind SWAG/NPM/Traefik with HTTPS -> set Trust Proxy true. Direct LAN access over http:// -> leave it false, and if you enable auth, reach Rackula over the proxy's https URL, not the raw http IP." The "enabled auth over plain HTTP" failure must be called out explicitly because it presents as a non-obvious login loop, not an error.

### 5. Volume / permissions: `/data` UID mismatch

This is the most concrete Unraid footgun. The API runs as **UID 1001** (`rackula` user); Unraid's appdata is conventionally owned by **nobody:users = 99:100**. Bind-mounting `/mnt/user/appdata/rackula` into a container that writes as 1001 means the process may be unable to create/write `/data` (permission denied), or it creates files owned by 1001 that the Unraid user cannot manage from the file browser. The frontend (nginx UID 101) is stateless so it is unaffected; this is purely an API-container issue.

**Template/AC must enforce:**

- Document the UID explicitly in the API template Description and support thread: "the API writes as UID 1001."
- Recommend one of: (a) `chown -R 1001:1001 /mnt/user/appdata/rackula` once at setup, or (b) if the image/entrypoint supports `PUID`/`PGID`-style remapping, expose those - but the codebase shows no PUID/PGID handling, so (a) is the realistic instruction unless #1317 adds PUID support.
- Flag as an open implementation question for #1317: do we add LinuxServer-style PUID/PGID to the API image (Unraid users expect it), or document the one-time chown? The chown is zero-code and ships now; PUID support is a nicer UX but is new code.

### 6. Supply chain: tag pinning and provenance

The compose files and external skeleton both reach for `:latest` / `:persist`. `:latest` on Unraid means an unattended "force update" can pull a different image than was reviewed, silently changing behaviour or pulling a regression.

**Template/AC must enforce:**

- Templates pin a concrete version tag (`ghcr.io/rackulalives/rackula:26.6.0`) rather than `:latest`, and the release process bumps the template tag in `RackulaLives/unraid-templates` per release. This makes the Apps-tab "update available" prompt meaningful and reviewable.
- The images already emit OCI labels (`org.opencontainers.image.source`, `.licenses=MIT`, `.title`, version/commit/build-time on the API). Keep these accurate so provenance is inspectable from the pulled image. AC: verify the published GHCR image carries the source label pointing at `RackulaLives/Rackula`.
- Both images are non-root (101 / 1001) and `<Privileged>false</Privileged>` must be set in both templates. Do not let a copy-paste flip privileged on.

---

## DEVIL'S-ADVOCATE lens

Putting on the hat of a long-time Unraid app maintainer / CA moderator who has watched a thousand "frontend + backend" submissions confuse users and rot in the catalogue.

### "Is two templates actually worse UX than one?"

Honestly, for the persistence user, yes, a bit, and the failure mode is predictable: someone installs `rackula`, makes layouts, restarts or switches browsers, and files "my layouts don't save." Here is the saving grace the codebase gives us, and it must be used: **the frontend alone is not dead.** Layouts persist in the browser. So the bug report is really "no cross-device / no server storage," not "total data loss." Prevent the confusion with three cheap moves:

1. Naming makes dependency obvious: `rackula` and `rackula-api`. A user seeing `rackula-api` in the Apps tab infers it is the backend half.
2. Frontend Overview states the boundary in plain words: "works on its own for a single browser; install rackula-api for server-side persistence / login." (Drafted above.)
3. API `<Requires>` text tells API installers they need the frontend too.

But be honest in #1317: this WILL generate some support traffic no matter what. The mitigation is documentation discipline, not a technical guarantee.

### "Is a separate unraid-templates repo + forum thread + CA submission worth it vs just shipping `docker-compose.persist.yml`?"

This is the sharpest challenge. Rackula ALREADY ships `docker-compose.persist.yml`. A meaningful slice of Unraid users run `docker compose` via the Compose Manager plugin and would be perfectly served by "here's our compose file." The CA route buys you **discoverability in the Apps tab** and the one-click frontend, which is real value for the non-compose crowd, but it costs:

- a new repo to keep in sync with every image tag bump,
- a forum thread someone must actually watch and answer,
- the ongoing "respond to support requests / keep compatible with new Unraid releases / notify if discontinuing" obligations CA explicitly imposes (`1995-external.md` section 1).

**Who maintains the forum thread?** This is unanswered and is a real commitment, not a checkbox. If the answer is "nobody reliably," CA listing is the wrong move and documenting compose is the honest one. #1317 should name an owner or scope CA as "frontend template + compose docs for persistence" (a hybrid: list the trivial frontend in CA, point persistence users at the existing compose file, skip the second template until demand proves out).

### "Does the optional-API split map to how Unraid users actually think?"

Mostly yes. Unraid users add containers one at a time from the Apps tab; a primary + optional companion is a familiar shape (plenty of \*arr-adjacent stacks work this way). The friction is not the two-step install, it is the **wiring** (`API_HOST` must match the API container's name, both must be on a reachable network, auth mode must match on both). That is more fiddly than the typical self-contained Unraid app and is exactly where users get stuck. If #1317 keeps the API container's default name `rackula-api` and the frontend's `API_HOST` default `rackula-api`, the happy path works with zero edits _provided both land on the same bridge network_ - verify that assumption holds on Unraid's default bridge, because container-name DNS resolution is not guaranteed on the stock `bridge` network (it works on user-defined networks). **This is a concrete thing #1317 must test, not assume.**

### "CA review / account-history prerequisite: can RackulaLives clear vetting?"

Partly known, partly not.

- GitHub history: likely fine. RackulaLives is a real org with an active repo and real release history; the "previous activity on GitHub / not fully AI written" screen is plausibly met (`1995-external.md` section 1).
- Unraid FORUM account: UNKNOWN and a hard prerequisite. CA requires a support _forum thread_, which means an Unraid forum account in good standing. The research does not establish that RackulaLives/the maintainer has one. Flag as a prerequisite/blocker for #1317: if there is no established Unraid forum presence, that account (and the thread) must be created before submission, and a brand-new forum account with no history may itself draw moderation scrutiny. Do not assume this is free.

### "Will the auth-mode dropdown (none/local/oidc) confuse users, especially OIDC on a LAN box?"

Yes, `oidc` is a foot-gun on the dropdown for a LAN appliance. Most Unraid users want `none` or, at most, `local`. Exposing `oidc` as a peer option invites someone to pick it and then hit the under-documented OIDC provider config (`1995-codebase.md` notes OIDC env vars are not fully enumerated, and OIDC setup is "MVP"). Recommendation for #1317:

- Keep the dropdown `none|local|oidc` (matches the app), but in the Description steer plainly: "Most homelab users want none or local. oidc requires an external identity provider and extra configuration."
- Treat OIDC-on-Unraid as explicitly out of scope for the first listing's documentation until the OIDC env surface is documented. Shipping a dropdown option the docs cannot fully support is a support-debt generator.

### "Anything that makes me say 'this is more work than #1317 assumes'?"

Yes, three things:

1. The UID 1001 vs 99:100 permission mismatch (secure-coding item 5) is the kind of detail that turns "install and go" into a forum thread full of "permission denied" reports. Either add PUID support (new code) or document the chown loudly. Not free.
2. Container-name networking on stock bridge (above) may force a "create a user-defined Docker network" instruction, which is an extra manual step most one-click apps do not need. Must be verified on real Unraid.
3. The forum thread + ongoing support obligation is a standing human cost, not a one-time implementation task. CA can _delist_ unmaintained apps. #1317 should not pretend the work ends at "XML merged."

---

## Recommendation summary

**Bottom line:** Ship the two-template CA model (frontend always, API optional). It is the correct, ecosystem-proven fit for Rackula's optional-backend shape, reuses the existing images unchanged, and keeps the common case one-click. The technical work is genuinely small; the real costs are (a) a few specific Unraid footguns the templates must defend against and (b) standing human/process commitments that are easy to under-scope. Do NOT combine into a fat image, do NOT ship a plugin.

### IMPLEMENTATION (belongs in #1317)

1. Author `rackula.xml` and `rackula-api.xml` per the skeletons above.
2. Mask secrets: `RACKULA_AUTH_SESSION_SECRET`, `RACKULA_LOCAL_PASSWORD`, write tokens -> `Mask="true"`; no baked defaults for any of them.
3. Pin image tags (not `:latest`); wire template tag bumps into the release process.
4. Set `<Privileged>false</Privileged>` on both; `/data` as `Required` rw path defaulting to `/mnt/user/appdata/rackula`.
5. Default `RACKULA_AUTH_MODE=none` and `RACKULA_TRUST_PROXY=false`; both surfaced with caveat Descriptions.
6. Write the guardrail Overview/Description text (auth=none is LAN-only; do not expose to internet without auth; behind a proxy set Trust Proxy true; API writes as UID 1001).
7. Decide and implement the `/data` permissions story: document the one-time chown (zero-code, ships now) OR add PUID/PGID support to the API image (new code, nicer UX) - pick one in #1317.
8. Verify on real Unraid: container-name resolution between `rackula` and `rackula-api` on the default bridge; if it fails, add a "create a user-defined network" step to the docs.
9. Confirm a square HTTPS PNG icon exists at a stable raw-GitHub path; add one if not.

### PREREQUISITE / RESEARCH-RESOLVED

- Distribution model decision (CA, two templates, no plugin): resolved by this spike.
- CA workflow (self-host repo + forum thread + submission form, one-container-per-template rule, masked-variable mechanics, icon/proxy/cookie behaviour): resolved.
- GitHub account-quality screen: likely met (real org, real history) - confirm, don't assume.
- Unraid forum account in good standing + a support thread: UNRESOLVED prerequisite. Must exist before CA submission. Open question: who owns it.
- OIDC-on-Unraid documentation: out of scope for the first listing until the OIDC env surface is documented elsewhere; the dropdown keeps the option but docs steer to none/local.

### NEW / SEPARATE WORKSTREAM (not #1317 implementation)

- Create and maintain `RackulaLives/unraid-templates` repo (hosting + `<TemplateURL>` self- reference + release-time tag sync). Small but ongoing.
- Create the Unraid forum support thread and assign an owner to answer it. This is a standing human commitment CA can enforce via delisting; it is not a code task and should be tracked separately from #1317.
- CA submission + moderation cycle (days to weeks, human-gated): track as its own task gated on the repo, thread, and icon being ready.
- (Optional, demand-driven) hybrid fallback: if no one can own the forum thread, scope down to "list the frontend template in CA, document `docker-compose.persist.yml` for persistence" instead of the second template. Worth holding as the escape hatch if the human-maintenance cost cannot be met.
