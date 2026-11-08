// Build-time default: browser storage. Container deployments overwrite this.
// CROSS-REF: deploy/docker-entrypoint-wrapper.sh (Docker) and .github/workflows/build-lxc.yml
// (LXC tarball) write the server-mode variants.
window.__RACKULA_CONFIG__ = { storage: "browser" };
