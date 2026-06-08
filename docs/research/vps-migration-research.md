# VPS Migration Research

**Date:** 2026-05-01
**Status:** Tabled — research only, no migration in progress
**Context:** Triggered by disk-pressure incident on current Vultr VPS that blocked GitHub Actions deploys (`d.racku.la`). Revisiting whether the current host is still the right choice.

---

## Current state

- **Provider:** Vultr
- **Tier:** smallest available — 1 vCPU / 2 GB RAM / 25 GB disk
- **Cost:** ~$12 USD/mo ≈ **~$17 CAD/mo** (incl. ~2.5% FX fee on most CDN cards)
- **Hosts:** `count.racku.la` (prod), `d.racku.la` (dev), GitHub Actions self-hosted runner
- **Recent issues:**
  - Disk hit 100% — root cause was 109 Docker images consuming 11 GB (15% reclaimable). 5 active containers actually need only ~1.6 GB.
  - GitHub Actions runner got stuck in "session already exists" loop after the disk filled, blocking deploys.
- **Mitigations applied this session:**
  - Pruned unused Docker images (reclaimed 9.7 GB → 51% disk used).
  - Installed `docker-prune.timer` systemd unit on VPS, runs Sundays 04:00 UTC, removes images unused for 7+ days.
  - Restarted runner twice (cleared stale session and stale disk-free cache).

---

## Options considered

### Move everything to homelab LXC (rejected for now)

- **Pros:** $0/mo, plenty of capacity (`pve-prod`), good learning exercise for Cloudflare Tunnel + LXC orchestration.
- **Cons:** prod (`count.racku.la`) becomes dependent on home power and ISP. UPS exists but state unknown. For a public-facing tool, "occasionally down when Qualicum loses power" is unattractive.
- **Possible future state:** move _dev_ only to LXC behind Cloudflare Tunnel, keep prod on a VPS. Doesn't save money on its own (VPS still has to exist for prod) but reduces homelab risk.

### Cheaper VPS providers (active option)

| Plan                   | Spec                          | Native price | **CAD/mo** | Datacenter     | Notes                               |
| ---------------------- | ----------------------------- | ------------ | ---------- | -------------- | ----------------------------------- |
| Vultr (current)        | 1 vCPU / 2 GB / 25 GB         | $12 USD      | ~$17       | various        | baseline                            |
| **Hetzner CX23** (x86) | 2 vCPU / 4 GB / 40 GB / 20 TB | €3.49        | **~$5.25** | DE/FI/US       | replaced CX22 in April 2026 refresh |
| Hetzner CAX11 (ARM)    | 2 vCPU / 4 GB / 40 GB / 20 TB | €3.79        | ~$5.70     | DE/FI only     | requires multi-arch Docker images   |
| **OVH Canada VPS-1**   | 4 vCPU / 8 GB / 75 GB NVMe    | $8.71 CAD    | **$8.71**  | Beauharnois QC | **currently sold out**              |
| OVH Canada VPS-2       | 6 vCPU / 12 GB / 100 GB NVMe  | $13.60 CAD   | $13.60     | Beauharnois QC | sold out                            |
| DigitalOcean Toronto   | 1 vCPU / 2 GB / 50 GB         | $12 USD      | ~$17       | YYZ            | no upgrade vs Vultr                 |
| Linode Toronto         | similar                       | $12 USD      | ~$17       | YYZ            | no upgrade vs Vultr                 |
| Contabo                | generous                      | low          | low        | various        | poor disk IO for Docker — avoid     |

### Ingress patterns (if homelab path is ever revisited)

- **Cloudflare Tunnel** — `cloudflared` on LXC, no open ports, free, TLS at CF edge, DDoS/WAF/Access included. Single-vendor dependency, CF sees plaintext. Best for a dev-preview that just needs to be reachable.
- **Tailscale + reverse proxy on both ends** — TS on LXC + small public node running Caddy (LE certs). End-to-end control of TLS, no third-party traffic inspection, works for arbitrary protocols. More moving parts and own DDoS exposure.
- **Tailscale Funnel** — simpler than the above but constrained (specific ports, one hostname per device). Fine for ad-hoc exposure.

---

## Recommendation (preserved for future decision)

**Primary pick:** **OVH Canada VPS-1** (when back in stock) — CAD-native billing, Montreal datacenter (~70 ms from BC), 4× CPU / 4× RAM / 3× disk vs. current, ~half the spend. No FX fees, no architecture change, daily backups + anti-DDoS included.

**Fallback while OVH is sold out:** **Hetzner CX23** in Hillsboro, OR — cheapest credible option (~$5.25 CAD), ~50 ms latency from BC, EUR billing is the only nuisance (mitigable with a no-FX-fee card like Wealthsimple Cash or Scotia Passport Visa Infinite).

**Stay on Vultr if:** the disk-pressure issue is now considered solved by the weekly prune timer, and the ~$11 CAD/mo savings isn't worth a migration. Honest cost of inaction is low.

---

## Decision deferred

Tabled this session — disk pressure is mitigated by the prune timer, runner is healthy. Revisit if:

- OVH Canada VPS stock returns and migration appetite is high
- Disk pressure recurs despite the prune timer (would suggest baseline footprint has grown, not just image churn)
- A no-FX-fee card is acquired (improves Hetzner economics meaningfully)

---

## References

- [Hetzner CX23 specs (Spare Cores)](https://sparecores.com/server/hcloud/cx23)
- [Hetzner cost-optimized lineup](https://www.hetzner.com/cloud/cost-optimized)
- [Hetzner April 2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [OVHcloud Canada VPS](https://www.ovhcloud.com/en-ca/vps/)
