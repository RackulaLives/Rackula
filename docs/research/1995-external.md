# Spike #1995 - External Research (Unraid distribution)

Research date: 2026-06-08. Scope: how to distribute Rackula (Docker frontend `ghcr.io/rackulalives/rackula` on :8080, optional Bun API on :3001 with `/data` volume, auth modes none/local/oidc) on Unraid. Working conclusion under test: ship as a **Community Applications (CA) Docker template**, not a native plugin.

Note on sourcing: the rendered `docs.unraid.net` pages are JS-hydrated and return empty bodies to a plain fetch, so several official-docs claims below are quoted via the indexed search summary of the same canonical URL rather than a direct fetch. Those URLs are still cited (they are the authoritative source); the Selfhosters.net templating guide and the long-running forum schema thread are used where a direct, quotable body was retrievable.

---

## 1. Community Applications: how it works & publishing workflow

### What CA is

Community Applications (CA) is itself an Unraid plugin (the "app store") authored by Squidly271, distributed as `community.applications.plg` and actively maintained (latest build dated `2025.01.28`) (src 6, src 12). Once installed it adds an **Apps** tab to the Unraid WebGUI. From that tab a user browses a moderated catalogue, and installing an app is effectively **one-click**: CA hands the app's Docker template XML to Unraid's built-in `dockerMan` template manager, which pre-fills the Add Container form (image, ports, paths, env vars) so the user just reviews and clicks Apply (src 1, src 5). The public web mirror of the same catalogue is browseable at `ca.unraid.net` / `unraid.net/community/apps` (src 5, src 8).

Key structural fact for Rackula: **CA installs exactly one container per template.** Each template = one `<Repository>` image. App settings are persisted as a per-container XML file under `/boot/config/plugins/dockerMan/templates-user` (src "multi-container" search, src 1). This single-container-per-template rule is the central constraint for section 3.

### The publishing workflow (how a template gets listed)

The official docs describe a three-step developer workflow (src 1):

1. "prepare your application's template files and documentation"
2. "create a support thread in the Unraid forums"
3. "submit your application via the Community Applications submission form"

Submissions are then "reviewed by the Community Applications moderation team, which performs basic vetting for security, functionality, and adherence to Unraid's design principles" (src 1). After listing, the developer is expected to: keep the app compatible with new Unraid releases, "respond to support requests in their forum threads," "clearly label beta or experimental versions," and "notify the moderation team if discontinuing support" (src 1). The moderation team "reserves the right to remove applications that become incompatible... or lack ongoing support," and for security-critical cases "may temporarily take over maintenance of abandoned projects" (src 1).

### Where the template XML actually lives (the self-hosted-repo model - confirmed)

This is the part newcomers misunderstand. CA does **not** store your XML for you. The prevailing/modern model is: **you host the template XML in your own GitHub repo** (e.g. `Owner/unraid-templates`) and that repo is registered with CA's catalogue. The historical "community" path was the `selfhosters/unRAID-CA-templates` request repo, where you open a **pull request** adding your XML and an approved template gets folded into Squidly271's `community.applications` feed (src 3). However, that request repo has explicitly announced "intent to slow down" accepting new requests and now "encourag[es] contributors to either create their own template repositories in Community Applications or transition to alternative community-backed repositories" (src 3). So the recommended path for a new app in 2025/2026 is the **maintainer's own template repo**, not the shared request repo.

The `<TemplateURL>` element inside the XML is the canonical "raw GitHub URL to the XML template" itself, which is how CA fetches updates to the template after listing (src 2).

### Prerequisites and quality bar

The community request repo states the practical bar that the moderation ethos mirrors (src 3):

> "The template must be made by a user with previous activity on GitHub. The application must be of certain quality - not fully AI written - and be attributed to a GitHub account with an active history."

So the gating prerequisites are: an **established GitHub account with real history** (no throwaway accounts), a **genuine (non-AI-slop) app**, a working template, and a **forum support thread**. There is no documented hard requirement on repo star count or repo age, but "previous activity" / "active history" is the explicit account-quality screen (src 3).

### Review timeline

Neither the docs nor the request repo publish a fixed SLA. The realistic expectation is a **human, moderator-driven review measured in days to a couple of weeks**, gated on the moderation team's volunteer bandwidth, and slowed further by the request repo's stated slow-down (src 1, src 3). Plan for "submit, then wait for a human," not instant publish.

**Rackula bottom line for section 1:** the right path is host our own `RackulaLives/unraid-templates` (or a `community-applications/` folder in the main repo), create an Unraid forum support thread, and submit through the CA form. Prerequisites are already met (real org, active history, real app). The friction is human review latency, not technical.

---

## 2. Docker template XML schema (with annotated example)

Authoritative sources: the long-running forum schema thread (src 4), the Selfhosters.net templating guide which mirrors it (src 7), and the (now redirecting) Unraid wiki schema page (src 9). The schema below is drawn from the Selfhosters guide, which returned a full quotable body (src 7).

### Container-level elements

Root element is `<Container version="2">`. Notable children (src 7):

| Element | Purpose |
| --- | --- |
| `<Name>` | Container name, preferably lowercase |
| `<Repository>` | Docker image, e.g. `ghcr.io/rackulalives/rackula` |
| `<Registry>` | Link to the image's registry/hub page |
| `<Network>` | Usually `bridge` or `host` |
| `<WebUI>` | Web UI URL pattern using macros: `http://[IP]:[PORT:8080]/` (auto-builds the "WebUI" button) |
| `<Icon>` | Direct **HTTPS** URL to a square PNG ("It has to be loaded over https") |
| `<Support>` | "A link to a support thread on the Unraid forums for the container" |
| `<Project>` | GitHub repo / project homepage URL |
| `<Overview>` | "Basic description of the project" shown in CA (Markdown) |
| `<Category>` | Category tags, e.g. `Tools:Management Productivity:` |
| `<TemplateURL>` | Raw GitHub URL of this XML file (used for template updates) |
| `<ExtraParams>` | Extra raw `docker run` flags, e.g. `--restart unless-stopped` |
| `<Requires>` | Free-text prerequisites warning shown to the user (used by multi-part apps) |
| `<ExtraSearchTerms>` | Space-delimited extra search keywords |
| `<Privileged>` | Boolean privileged mode (security-sensitive; keep false) |
| `<ReadMe>` / `<Banner>` / `<Screenshot>` / `<Beta>` | README link, banner, gallery shots, beta flag |

Icon requirements specifically: a **direct HTTPS link to a PNG**, square, served over https; the canonical hosting pattern is a raw GitHub URL like `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/img/<app>.png` (src 7). Theme variants `Icon-black` / `Icon-white` / etc. are optional (src 7).

### The `<Config>` element (ports, paths, env vars, labels)

Every port, volume, and environment variable is one `<Config>` entry. General shape (src 7):

```xml
<Config Name="Label" Target="destination" Default="value"
        Type="Port|Path|Variable|Label|Device"
        Mode="rw|ro|tcp"
        Description="Help text shown to the user"
        Display="always|advanced|always-hide|advanced-hide"
        Required="true|false"
        Mask="true|false"/>
```

Type-specific meaning (src 7):

- `Type="Port"` - `Target` is the _container_ port (e.g. `8080`), `Mode` is the protocol (`tcp`/`udp`), `Default` is the suggested _host_ port. Pairs with `<WebUI>`.
- `Type="Path"` - `Target` is the _container_ mount path (e.g. `/data`), `Default` is the suggested host path (e.g. `/mnt/user/appdata/rackula`), `Mode` is `rw`/`ro`. Guidance: "If it's a proper appdata location, set required to yes" (src 7).
- `Type="Variable"` - `Target` is the _env var name_ (e.g. `RACKULA_AUTH_MODE`); no `Mode`; `Mask="true"` hides the value behind asterisks (use for secrets/session keys).
- `Type="Label"` - display-only text, no user input.
- `Type="Device"` - maps a host device into the container.

Shared attributes (src 7): `Display` controls visibility tier - `always` (basic, editable), `always-hide` (basic, locked), `advanced` (advanced view, editable), `advanced-hide`. A pipe-delimited `Default` renders a **dropdown**, which is ideal for Rackula's auth mode, e.g. `Default="none|local|oidc"` (src 7).

### Annotated skeleton for Rackula (frontend container)

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>rackula</Name>
  <Repository>ghcr.io/rackulalives/rackula</Repository>
  <Registry>https://github.com/RackulaLives/Rackula/pkgs/container/rackula</Registry>
  <Network>bridge</Network>
  <Privileged>false</Privileged>
  <Support>https://forums.unraid.net/topic/XXXXXX-support-rackula/</Support>
  <Project>https://github.com/RackulaLives/Rackula</Project>
  <Overview>Rackula is a rack layout designer for homelabbers. This container
    serves the frontend. Add the optional Rackula API container for persistence
    and local/OIDC auth.</Overview>
  <Category>Productivity: Tools:Utilities:</Category>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <Icon>https://raw.githubusercontent.com/RackulaLives/Rackula/main/static/icon.png</Icon>
  <TemplateURL>https://raw.githubusercontent.com/RackulaLives/unraid-templates/main/rackula.xml</TemplateURL>
  <ExtraParams>--restart unless-stopped</ExtraParams>

  <!-- HTTP port: container 8080 -> suggested host 8080 -->
  <Config Name="WebUI Port" Target="8080" Default="8080" Mode="tcp"
          Type="Port" Display="always" Required="true" Mask="false"
          Description="Port for the Rackula web interface."/>

  <!-- Example env var as a dropdown -->
  <Config Name="Auth Mode" Target="RACKULA_AUTH_MODE" Default="none|local|oidc"
          Type="Variable" Display="always" Required="false" Mask="false"
          Description="Authentication mode. 'none' is fine for a trusted LAN."/>

  <!-- Trust proxy flag (relevant behind SWAG/NPM, see section 4) -->
  <Config Name="Trust Proxy" Target="RACKULA_TRUST_PROXY" Default="false|true"
          Type="Variable" Display="advanced" Required="false" Mask="false"
          Description="Set true only when Rackula sits behind a reverse proxy."/>
</Container>
```

The optional API container would be a **second, separate template** of the same shape, with `<Repository>` pointing at the Bun API image, a `Type="Port"` for `3001`, and a `Type="Path"` mapping `/data` to `/mnt/user/appdata/rackula` (see section 3 for why two templates).

---

## 3. Multi-container apps on Unraid (frontend + optional API)

This is the key architectural question, because CA is hard-wired to **one container per template** (section 1, src 1). There is no Compose/stack primitive in stock CA; an app that needs N containers is expressed as N independent templates the user installs in sequence.

### How real multi-part apps handle it (prevailing patterns)

- Uptime Kuma - genuinely single-container. One image, one template, a `/app/data` volume; no second service needed (src 6). This is the easy baseline.
- Homepage (gethomepage) - also single-container; one image plus a config volume (src 5).
- KitchenOwl (frontend + backend) - the most instructive concrete example for Rackula. Its evolution is documented: "The setup changed so that the frontend is now required... it's recommended to host the frontend too, with traffic routed through there to the backend" (src "KitchenOwl" search). Two distribution shapes coexist in CA:
  1. One combined template/image - "there's a template that includes both front and backend in one template that you can install from Community Applications" (src KitchenOwl).
  2. Two separate containers - if run apart, the user installs both and wires them with env vars: "FRONT_URL should point to the local IP & Port of the WebUI container, and BACK_URL should point to the Backend Container's IP & Port" (src KitchenOwl).
- Homelabarr - ships a backend template and a frontend template explicitly "designed to be used in conjunction with" each other (src "multi-container" search) - the pure two-template model.

So across the ecosystem there are three idiomatic answers, in rough order of user-friendliness:

1. One combined image (a single container running both processes, e.g. via s6/supervisor or an nginx that also proxies an internal API). User installs one template - simplest UX, most maintenance burden on the maintainer's image.
2. Two templates, user adds the second - the Homelabarr / KitchenOwl-split model. Each template is independent; the optional one is genuinely optional. The `<Requires>` element and the `<Overview>` text are used to tell the user "this needs the other container."
3. Frontend-only template + docs - ship just the always-needed container and document the optional second container for advanced users.

### Idiomatic answer for Rackula's _optional_ API

Rackula's API is **optional** (frontend works standalone with auth-mode `none`). That maps cleanly to model **2**: publish a primary **`rackula` (frontend)** template plus a separate **`rackula-api`** template. The frontend `<Overview>` advertises the API as optional; the API template carries the `/data` volume and the auth/session env vars. This keeps the common case one-click (frontend only) while letting persistence/OIDC users add the second container, and it avoids the maintenance cost of building/shipping a fat combined image just to satisfy CA's one-container rule. A combined single image would only be justified if we wanted the persistence path to be the default zero-config experience; given the API is explicitly optional, two templates is the better fit. (Synthesis from src 1 + KitchenOwl/Homelabarr.)

---

## 4. Reverse proxy / SSL patterns on Unraid

Most Unraid users do not expose containers directly; they put a reverse proxy in front for HTTPS. The two dominant choices in the Unraid/homelab community are **SWAG** (LinuxServer.io's nginx + built-in Certbot + fail2ban) and **Nginx Proxy Manager (NPM)**, with **Traefik** as the more advanced, label-driven option (src "reverse proxy" search, src 11). SWAG "just works for most users" and ships "preset reverse proxy config files... for popular apps," whereas Traefik is more automated via Docker labels but more involved to set up; NPM is the GUI-first option favoured by users who want point-and-click (src reverse-proxy search). In practice **SWAG and NPM are the most common on Unraid**, both nginx-based.

The standard Unraid pattern: put SWAG/NPM and the app on a **shared Docker "proxy" network** so the proxy can reach the app by container name, then the proxy terminates TLS and forwards to the app's internal port (src 10). For SWAG specifically, each app's proxy config `include /config/nginx/proxy.conf;`, which sets the forwarded headers (src "X-Forwarded" search):

```nginx
proxy_set_header X-Real-IP        $remote_addr;
proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### Why this matters for Rackula's `RACKULA_TRUST_PROXY` and secure cookies

The proxy terminates HTTPS and talks to Rackula over plain HTTP internally. The backend therefore cannot tell from the socket that the _client_ used HTTPS; it must read `X-Forwarded-Proto` (src "X-Forwarded" search). That header "tells the backend application whether the original request came through HTTPS or HTTP" and "prevents issues where an application might reject or downgrade secure cookies when it incorrectly detects the connection protocol" (src "X-Forwarded" search). This is exactly the situation `RACKULA_TRUST_PROXY` exists for: when set, Rackula should honour `X-Forwarded-Proto` so its auth-session cookies get the `Secure` attribute and OIDC redirect URLs are built as `https://`.

**Distribution implication:** the CA template should expose `RACKULA_TRUST_PROXY` as an **advanced** `Type="Variable"` defaulting to `false` (LAN-direct case), and the support thread / `<Overview>` should tell SWAG/NPM users to set it `true`. There is no Unraid-specific code change needed - just correct documentation and a discoverable env var in the template.

---

## 5. Plugin (.plg) model and why it's wrong for a Dockerized app

### What a `.plg` is

An Unraid plugin is an XML `.plg` descriptor that "integrate[s] directly with the operating system, enabling system-level enhancements... beyond what isolated containers can provide" (src 13). A `.plg` can install Slackware packages, drop files anywhere on the system, and **run arbitrary scripts at array start / boot**; plugins are granted "full filesystem access" and "deep integration with Unraid OS and the WebGUI" (src 13). That power is the point for things like driver/hardware plugins - and exactly the problem for an app that is already a self-contained Docker image.

### The official guidance is explicit

Unraid's own docs say to "reserve plugins for features that require direct integration with Unraid OS" and to use Docker containers "whenever you can"; plugins are for "system-level services or enhancements that need direct access to Unraid OS or the WebGUI" and "features that cannot be provided as Docker containers" (src 13, src "plugin vs docker" search). Rackula meets none of those criteria - it is a web app that already ships as a container.

### Concrete reasons Rackula should NOT ship as a plugin

1. No isolation / larger attack surface. Containers "run safely in isolated environments, while plugins have direct OS access"; plugins' "full filesystem access increases security risks" (src 13). Shipping a web app as a plugin would hand a web-facing app root-level host access for zero benefit, whereas the container model sandboxes it.

2. Higher moderation/trust bar, less benefit. The official advice is "only install plugins from trusted sources or well-known developers" (src 13) - i.e. plugins carry a heavier trust expectation than a routine CA Docker template, which only needs the moderation team's "basic vetting" (src 1). A new app clears the Docker-template bar far more easily.

3. Must survive every Unraid OS upgrade. Plugins "can cause system instability, especially after OS updates," and when Unraid upgrades it "won't automatically remove incompatible plugins already installed" - users must manually check release notes for plugin breakage (src 13). A plugin is thus an open-ended maintenance commitment tied to the host OS lifecycle. A container is decoupled: image pinning and the normal Apps-tab update flow keep working across OS upgrades (src "plugin vs docker" search).

4. Wrong tool for the job / no packaging win. Rackula is portable across any Docker host (it already runs on the homelab, VPS, etc.). A `.plg` would re-implement install/upgrade logic that the container runtime + CA already provide for free, and would only run on Unraid - strictly more code to maintain for a strictly smaller audience.

**Verdict:** plugin distribution is rejected. The CA Docker template path gives one-click install, container isolation, OS-upgrade resilience, a lower review bar, and reuse of the existing image - with the only cost being human review latency at submission time.

---

## Sources (numbered URL list)

1. Community Applications - Unraid Docs: https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/community-applications/
2. (also) Community Applications manual page - Unraid Docs: https://docs.unraid.net/unraid-os/manual/applications/
3. selfhosters/unRAID-CA-templates (community request repo + quality bar + slow-down notice): https://github.com/selfhosters/unRAID-CA-templates
4. Docker Template XML Schema (forum thread, authoritative schema): https://forums.unraid.net/topic/38619-docker-template-xml-schema/
5. Unraid Community Apps catalogue (public mirror): https://ca.unraid.net/apps / https://unraid.net/community/apps
6. [Plug-In] Community Applications support thread (CA is itself a plugin, build dates): https://forums.unraid.net/topic/38582-plug-in-community-applications/
7. Writing a template compatible for Unraid - Selfhosters.net (full XML schema + Config attrs + icon rules): https://selfhosters.net/docker/templating/templating/
8. Unraid Community Apps catalog: https://ca.unraid.net/
9. Unraid wiki DockerTemplateSchema (now 301-redirects to docs.unraid.net): https://wiki.unraid.net/DockerTemplateSchema
10. Cloudflare Tunnel + SWAG nginx reverse proxy on Unraid (proxy-network pattern): https://christiantietze.de/posts/2025/05/cloudflare-tunnel-swag-nginx-reverse-proxy-unraid/
11. linuxserver/docker-swag (SWAG: nginx + Certbot + fail2ban): https://github.com/linuxserver/docker-swag / reverse-proxy confs: https://github.com/linuxserver/reverse-proxy-confs
12. community.applications.plg (Squidly271, the CA plugin descriptor): https://raw.githubusercontent.com/Squidly271/community.applications/master/plugins/community.applications.plg
13. Plugins - Unraid Docs (what .plg is, security, OS-upgrade caveats, "reserve plugins for..."): https://docs.unraid.net/unraid-os/using-unraid-to/customize-your-experience/plugins/

KitchenOwl multi-container template references (frontend/backend split + combined-image option):

- https://github.com/UnknownHiker/unraid-template-kitchenowl/blob/main/README.md
- https://codeberg.org/HanSolo97/unraid-templates/src/branch/main/README.md
- https://codeberg.org/HanSolo97/unraid-templates/issues/4 (frontend became required)

SWAG X-Forwarded-Proto / secure-cookie references:

- https://docs.ibracorp.io/docs/reverse-proxies/swag/
- https://github.com/linuxserver/reverse-proxy-confs/issues/310

Plugins vs Docker (official guidance + community thread):

- https://forums.unraid.net/topic/35906-docker-vs-plugins/
- https://docs.unraid.net/unraid-os/manual/applications/
