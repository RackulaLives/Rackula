---
created: 2025-11-27
updated: 2026-01-23
status: active
---

# Rackula — Product Roadmap

Strategic vision and version philosophy. For active work items, see [GitHub Issues](https://github.com/RackulaLives/Rackula/issues).

---

## Vision

Rackula is a lightweight, FOSS, web-based rack layout designer for homelabbers. It prioritises:

- **Simplicity** — Do one thing well: visual rack planning
- **Offline-first** — Works without accounts or cloud services
- **Self-hostable** — Deployable on your own infrastructure
- **Community-driven** — Built by homelabbers, for homelabbers

---

## Version Philosophy

- **Incremental releases** — Each version is usable and complete
- **Scope discipline** — Features stay in their designated version
- **Spec-driven** — No implementation without specification
- **User value** — Each release solves real problems

---

## Current Focus

**v0.6.x** — Stability, polish, and public launch preparation (multi-rack support complete)

**v0.7.0** — [Theme TBD based on community feedback]

See [GitHub Milestones](https://github.com/RackulaLives/Rackula/milestones) for version-specific work items.

---

## Future Priorities

Rough priority order for future development. Subject to change based on community feedback.

### 1. Mobile & PWA

- Full mobile phone support (create/edit layouts)
- Touch-friendly interactions
- Progressive Web App (installable, offline)
- Primary targets: iPhone SE, iPhone 14, Pixel 7

### 2. Airflow Visualisation

- Visual indicators for device airflow direction
- Hot/cold aisle awareness
- Conflict detection (opposing airflow)

### 3. Cable Routing

- Visual cable path representation
- Port/connection definitions on devices
- Cable type metadata

### 4. Weight/Load Calculations

- Device weight metadata
- Per-U load calculations
- Rack weight capacity warnings

### 5. Power Tracking

- Device power requirements
- Total rack power calculation
- PDU capacity planning

### 6. Network Connectivity

- Port count requirements
- Patch panel tracking
- Basic connectivity metadata

---

## Backlog

Unscheduled ideas. May or may not be implemented.

| Feature                   | Notes                                   |
| ------------------------- | --------------------------------------- |
| Custom device categories  | User-defined categories beyond defaults |
| 3D visualisation          | Three.js rack view                      |
| Cloud sync / accounts     | User accounts, cloud storage            |
| Collaborative editing     | Real-time multi-user                    |
| Tablet-optimised layout   | Enhanced tablet experience              |
| Import from CSV           | Bulk device import                      |
| NetBox device type import | Import from community library           |
| Export both rack views    | Front + rear in single export           |
| 0U vertical PDU support   | Rail-mounted PDUs                       |

---

## Out of Scope

Features that will **not** be implemented:

- Backend/database requirements
- User accounts (without cloud sync feature)
- Internet Explorer support
- Native mobile apps

---

## Contributing

See [GitHub Issues](https://github.com/RackulaLives/Rackula/issues) for ways to contribute:

- Issues labelled `ready` are available for implementation
- Issues labelled `triage` need maintainer review first
- Feature requests welcome via issue template

---

_This document defines product vision. For active work items, see [GitHub Issues](https://github.com/RackulaLives/Rackula/issues)._
