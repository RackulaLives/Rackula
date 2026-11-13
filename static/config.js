// Build-time default: browser storage. Container deployments overwrite this.
// CROSS-REF: deploy/docker-entrypoint-wrapper.sh (Docker) and deploy/lxc/config.js
// (LXC tarball) provide the server-mode variants.
window.__RACKULA_CONFIG__ = { storage: "browser" };
