// Build-time default: browser storage. Container deployments overwrite this.
// CROSS-REF: deploy/docker-entrypoint-wrapper.sh (Docker) and deploy/lxc/community-scripts
// install/rackula-install.sh + ct/rackula.sh (LXC) write the runtime variants.
window.__RACKULA_CONFIG__ = { storage: "browser" };
