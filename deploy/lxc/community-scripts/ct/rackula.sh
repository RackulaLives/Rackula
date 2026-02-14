#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: gVNS
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/RackulaLives/Rackula

APP="Rackula"
var_tags="${var_tags:-homelab}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-256}"
var_disk="${var_disk:-4}"
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

  RELEASE=$(get_latest_github_release "RackulaLives/Rackula")
  if check_for_gh_release "rackula" "RackulaLives/Rackula"; then
    msg_info "Stopping Services"
    systemctl stop rackula-api
    systemctl stop nginx
    msg_ok "Stopped Services"

    msg_info "Backing up data"
    cp -a /opt/rackula/data /opt/rackula/data.bak
    msg_ok "Backed up data"

    msg_info "Updating ${APP} to ${RELEASE}"
    TARBALL_URL="https://github.com/RackulaLives/Rackula/releases/download/${RELEASE}/rackula-lxc-${RELEASE}.tar.gz"
    $STD curl -fsSL "$TARBALL_URL" -o /tmp/rackula-lxc.tar.gz
    tar xzf /tmp/rackula-lxc.tar.gz -C /tmp
    TARBALL_DIR="/tmp/rackula-lxc-${RELEASE}"

    # Update frontend
    rm -rf /opt/rackula/frontend/*
    cp -r "${TARBALL_DIR}/frontend/"* /opt/rackula/frontend/

    # Update API
    rm -rf /opt/rackula/api/src /opt/rackula/api/node_modules /opt/rackula/api/package.json /opt/rackula/api/tsconfig.json
    cp -r "${TARBALL_DIR}/api/src" /opt/rackula/api/
    cp -r "${TARBALL_DIR}/api/node_modules" /opt/rackula/api/
    cp "${TARBALL_DIR}/api/package.json" /opt/rackula/api/
    cp "${TARBALL_DIR}/api/tsconfig.json" /opt/rackula/api/

    # Update security headers only (preserve user's nginx config)
    cp "${TARBALL_DIR}/config/security-headers.conf" /etc/nginx/snippets/security-headers.conf

    chown -R rackula:rackula /opt/rackula/api
    echo "${RELEASE}" >~/.rackula

    # Cleanup
    rm -rf /tmp/rackula-lxc.tar.gz "${TARBALL_DIR}"
    msg_ok "Updated ${APP} to ${RELEASE}"

    msg_info "Starting Services"
    systemctl start rackula-api
    systemctl start nginx
    msg_ok "Started Services"

    # Remove backup on success
    rm -rf /opt/rackula/data.bak
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
