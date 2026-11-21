// Shipped as frontend/config.js in the LXC tarball (build-lxc.yml, build-lxc-dev.yml).
// The LXC always runs the API beside the frontend, so it uses server storage (#2060).
// CROSS-REF: static/config.js (browser-mode default) and deploy/docker-entrypoint-wrapper.sh.
window.__RACKULA_CONFIG__ = { storage: "server" };
