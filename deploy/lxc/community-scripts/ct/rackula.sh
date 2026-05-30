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
    exit 1
  fi

  # Prevent concurrent updates (mkdir is atomic, touch is not)
  if ! mkdir /tmp/rackula-update.lock 2>/dev/null; then
    msg_error "Update already in progress"
    exit 1
  fi

  # Track update success for rollback decisions
  UPDATE_SUCCESS=0

  # Rollback on failure — restore from backup unless update succeeded
  cleanup() {
    if [[ -d /opt/rackula-backup ]] && [[ $UPDATE_SUCCESS -eq 0 ]]; then
      # Persistent data may already have been moved into the new install
      # (see data-restore step below). Move it back so it is not destroyed
      # by the rm -rf, then restore the backup wholesale.
      if [[ -d /opt/rackula/data ]] && [[ ! -d /opt/rackula-backup/data ]]; then
        mv /opt/rackula/data /opt/rackula-backup/data
      fi
      rm -rf /opt/rackula
      mv /opt/rackula-backup /opt/rackula
      # Restart services with the restored installation
      systemctl daemon-reload
      systemctl start rackula-api
      systemctl start nginx
      msg_error "Update failed — restored from backup"
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
    if ! mv /opt/rackula-backup/data /opt/rackula/data; then
      msg_error "Failed to restore data directory"
      exit 1
    fi

    # Update config files from the new release
    if ! cp /opt/rackula/config/nginx.conf /etc/nginx/sites-available/rackula; then
      msg_error "Failed to update nginx site config"
      exit 1
    fi
    if ! cp /opt/rackula/config/security-headers.conf /etc/nginx/snippets/security-headers.conf; then
      msg_error "Failed to update nginx security headers"
      exit 1
    fi
    if ! cp /opt/rackula/config/rackula-api.service /etc/systemd/system/rackula-api.service; then
      msg_error "Failed to update rackula-api service"
      exit 1
    fi
    if [[ -f /opt/rackula/config/nginx.service.d-override.conf ]]; then
      mkdir -p /etc/systemd/system/nginx.service.d
      if ! cp /opt/rackula/config/nginx.service.d-override.conf /etc/systemd/system/nginx.service.d/override.conf; then
        msg_error "Failed to update nginx service override"
        exit 1
      fi
    fi

    # Set ownership
    chown -R root:root /opt/rackula/frontend
    find /opt/rackula/frontend -type d -exec chmod 755 {} \;
    find /opt/rackula/frontend -type f -exec chmod 644 {} \;
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
      if curl -sf --connect-timeout 2 --max-time 5 http://127.0.0.1:3001/health >/dev/null 2>&1; then
        msg_ok "Service running successfully"
        break
      fi
      if [ "$i" -eq 10 ]; then
        msg_error "API failed to start within 10 seconds"
        exit 1
      fi
      sleep 1
    done

    # Mark update as successful so cleanup doesn't roll back
    UPDATE_SUCCESS=1

    # Remove backup only after services verified
    rm -rf /opt/rackula-backup
    msg_ok "Updated successfully!"
  fi
  exit 0
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}${CL}"