#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: gVNS
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/RackulaLives/Rackula

APP="Rackula"
var_tags="${var_tags:-homelab}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-512}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -f ~/.rackula ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  # Prevent concurrent updates (mkdir is atomic, touch is not)
  if ! mkdir /tmp/rackula-update.lock 2>/dev/null; then
    msg_error "Update already in progress"
    exit 1
  fi

  # Rollback on failure — restore full installation if update broke things
  cleanup() {
    if [[ -d /opt/rackula-backup ]]; then
      if [[ ! -d /opt/rackula ]] || [[ ! -d /opt/rackula/data ]]; then
        rm -rf /opt/rackula
        mv /opt/rackula-backup /opt/rackula
        msg_error "Update failed — restored from backup"
      fi
    fi
    rm -rf /tmp/rackula-update.lock
  }
  trap cleanup EXIT

  if check_for_gh_release "rackula" "RackulaLives/Rackula"; then
    msg_info "Stopping Services"
    systemctl stop rackula-api
    systemctl stop nginx
    msg_ok "Stopped Services"

    msg_info "Backing up data"
    rm -rf /opt/rackula-backup
    mv /opt/rackula /opt/rackula-backup
    msg_ok "Backed up data"

    msg_info "Updating ${APP} to ${CHECK_UPDATE_RELEASE}"
    fetch_and_deploy_gh_release "rackula" "RackulaLives/Rackula" "prebuild" "latest" "/opt/rackula" "rackula-lxc-*.tar.gz"

    # Restore persistent data from backup
    mv /opt/rackula-backup/data /opt/rackula/data

    # Update config files from the new release
    cp /opt/rackula/config/security-headers.conf /etc/nginx/snippets/security-headers.conf
    cp /opt/rackula/config/rackula-api.service /etc/systemd/system/rackula-api.service
    if [[ -f /opt/rackula/config/nginx.service.d-override.conf ]]; then
      mkdir -p /etc/systemd/system/nginx.service.d
      cp /opt/rackula/config/nginx.service.d-override.conf /etc/systemd/system/nginx.service.d/override.conf
    fi

    # Set ownership
    chown -R root:root /opt/rackula/frontend
    chmod -R 755 /opt/rackula/frontend
    chown -R rackula:rackula /opt/rackula/api
    chown -R rackula:rackula /opt/rackula/data
    chmod 750 /opt/rackula/data

    msg_ok "Updated ${APP} to ${CHECK_UPDATE_RELEASE}"

    msg_info "Starting Services"
    systemctl daemon-reload
    systemctl start rackula-api
    systemctl start nginx
    msg_ok "Started Services"

    msg_info "Verifying Services"
    for i in $(seq 1 10); do
      if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
        msg_ok "Service running successfully"
        break
      fi
      if [ "$i" -eq 10 ]; then
        msg_error "API failed to start within 10 seconds"
        exit 1
      fi
      sleep 1
    done

    # Remove backup only after services verified
    rm -rf /opt/rackula-backup
    msg_ok "Updated successfully!"
  fi
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}${CL}"