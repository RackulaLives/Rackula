#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: gVNS (ggfevans)
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://github.com/RackulaLives/Rackula

APP="Rackula"
var_tags="${var_tags:-homelab}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-512}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/rackula ]]; then
    msg_error "No ${APP} Installation Found!"
    exit 1
  fi

  # RACKULA_PREBUILD_TARBALL (dev/test only): when set to a local tarball, force the update
  # body to run and deploy that payload instead of a published release. Inert when unset.
  # Fail before stopping services if it is set but missing (a typo must not trigger an update).
  if [[ -n "${RACKULA_PREBUILD_TARBALL:-}" && ! -f "${RACKULA_PREBUILD_TARBALL}" ]]; then
    msg_error "RACKULA_PREBUILD_TARBALL set but file not found: ${RACKULA_PREBUILD_TARBALL}"
    exit 1
  fi

  if [[ -n "${RACKULA_PREBUILD_TARBALL:-}" ]] || check_for_gh_release "rackula" "RackulaLives/Rackula"; then
    msg_info "Stopping Services"
    systemctl stop rackula-api nginx
    msg_ok "Stopped Services"

    msg_info "Backing up Data"
    if [[ -d /opt/rackula_data_backup && ! -d /opt/rackula/data ]]; then
      mv /opt/rackula_data_backup /opt/rackula/data
    fi
    rm -rf /opt/rackula_data_backup
    cp -r /opt/rackula/data /opt/rackula_data_backup || {
      msg_error "Data backup failed; aborting before any changes"
      systemctl start nginx rackula-api || true
      exit 1
    }
    msg_ok "Backed up Data"

    if [[ -n "${RACKULA_PREBUILD_TARBALL:-}" && -f "${RACKULA_PREBUILD_TARBALL}" ]]; then
      msg_info "Deploying dev prebuild (RACKULA_PREBUILD_TARBALL)"
      rm -rf /opt/rackula/*
      mkdir -p /opt/rackula
      tar --no-same-owner -xzf "$RACKULA_PREBUILD_TARBALL" -C /opt/rackula --strip-components=1
      msg_ok "Deployed dev prebuild"
    else
      CLEAN_INSTALL=1 fetch_and_deploy_gh_release "rackula" "RackulaLives/Rackula" "prebuild" "latest" "/opt/rackula" "rackula-lxc-*.tar.gz"
    fi

    msg_info "Restoring Data"
    rm -rf /opt/rackula/data
    mv /opt/rackula_data_backup /opt/rackula/data
    msg_ok "Restored Data"

    msg_info "Updating Configuration"
    cp /opt/rackula/config/nginx.conf /etc/nginx/sites-available/rackula
    cp /opt/rackula/config/security-headers.conf /etc/nginx/snippets/security-headers.conf
    cp /opt/rackula/config/rackula-api.service /etc/systemd/system/rackula-api.service
    mkdir -p /etc/systemd/system/nginx.service.d
    cp /opt/rackula/config/nginx.service.d-override.conf /etc/systemd/system/nginx.service.d/override.conf
    # Rewrite runtime storage mode config: the tarball ships a browser-mode default.
    # CROSS-REF: keep in sync with install/rackula-install.sh and static/config.js.
    # env key omitted intentionally: absent RACKULA_ENV means production (no dev build toast)
    printf 'window.__RACKULA_CONFIG__ = { storage: "server" };\n' >/opt/rackula/frontend/config.js
    chown -R root:root /opt/rackula/frontend
    find /opt/rackula/frontend -type d -exec chmod 755 {} \;
    find /opt/rackula/frontend -type f -exec chmod 644 {} \;
    chown -R rackula:rackula /opt/rackula/{api,data}
    chmod 750 /opt/rackula/data
    systemctl daemon-reload
    msg_ok "Updated Configuration"

    msg_info "Starting Services"
    if ! nginx -t >/dev/null 2>&1; then
      msg_error "nginx configuration test failed (run 'nginx -t' for details)"
      systemctl start nginx rackula-api || true
      exit 1
    fi
    systemctl start nginx rackula-api
    msg_ok "Started Services"

    msg_info "Verifying Services"
    for i in $(seq 1 10); do
      if curl -sf --connect-timeout 2 --max-time 5 http://127.0.0.1/api/health >/dev/null 2>&1; then
        msg_ok "Service running successfully"
        break
      fi
      if [ "$i" -eq 10 ]; then
        msg_error "Service failed to respond on http://127.0.0.1/api/health within 10 seconds"
        exit 1
      fi
      sleep 1
    done

    msg_ok "Updated successfully!"
  fi
  exit
}

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}${CL}"
