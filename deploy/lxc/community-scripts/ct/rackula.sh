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
var_arm64="${var_arm64:-no}"
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

  # Prevent concurrent updates with an fd-based advisory lock. flock releases the
  # lock automatically when the process exits (including a crash or host reboot),
  # so a stale lock can never permanently block future updates. The lock lives
  # under root-owned /run (not world-writable like /tmp) so a local user cannot
  # pre-plant a symlink there and have this root process truncate its target.
  mkdir -p /run/rackula
  exec 9>/run/rackula/update.lock || {
    msg_error "Cannot open update lock file"
    exit 1
  }
  if ! flock -n 9; then
    msg_error "Update already in progress"
    exit 1
  fi

  # Currently-installed version, captured so rollback can restore the marker.
  OLD_VERSION="$(cat ~/.rackula 2>/dev/null || true)"

  # Track update success for rollback decisions
  UPDATE_SUCCESS=0
  # Set once this run owns the backup/swap, so rollback never acts on a stale
  # /opt/rackula-backup left behind by a previously killed run.
  SWAP_STARTED=0

  # Rollback on failure. Runs as the EXIT trap under errexit, so every step is
  # guarded: a failure here must not abort the trap before recovery completes.
  # shellcheck disable=SC2329 # invoked indirectly via 'trap cleanup EXIT' below
  cleanup() {
    if [[ $UPDATE_SUCCESS -eq 0 ]]; then
      # The release fetch advances ~/.rackula to the new version before the swap,
      # so restore the marker on every rollback path (including pre-swap failures
      # and an aborted data move). Otherwise the install reports "up to date" on
      # the next run while still running the old code.
      if [[ -n "$OLD_VERSION" ]]; then
        echo "$OLD_VERSION" >~/.rackula
      fi

      # Only undo on-disk changes when THIS run started the swap. A stale
      # /opt/rackula-backup left by a previously killed run must never be
      # restored over a good install.
      if [[ $SWAP_STARTED -eq 1 ]] && [[ -d /opt/rackula-backup ]]; then
        # Persistent data may already have been moved into the new install. Move
        # it back before restoring the backup, but only destroy the live tree once
        # the data move has succeeded, so user data is never lost.
        local data_safe=1
        if [[ -d /opt/rackula/data ]] && [[ ! -d /opt/rackula-backup/data ]]; then
          if ! mv /opt/rackula/data /opt/rackula-backup/data; then
            data_safe=0
            msg_error "Rollback: could not preserve data; leaving /opt/rackula intact to avoid data loss"
          fi
        fi
        if [[ $data_safe -eq 1 ]]; then
          rm -rf /opt/rackula
          mv /opt/rackula-backup /opt/rackula
          # Restore the /etc unit + nginx files overwritten this run together with
          # the old code, so config and code stay matched, before reloading and
          # starting services. (If data could not be preserved above we keep the
          # new install in place, so the new /etc is left to match it.)
          if [[ -d /opt/rackula-etc-backup ]]; then
            cp -a /opt/rackula-etc-backup/rackula /etc/nginx/sites-available/rackula 2>/dev/null || true
            cp -a /opt/rackula-etc-backup/security-headers.conf /etc/nginx/snippets/security-headers.conf 2>/dev/null || true
            cp -a /opt/rackula-etc-backup/rackula-api.service /etc/systemd/system/rackula-api.service 2>/dev/null || true
            if [[ -f /opt/rackula-etc-backup/nginx-override.conf ]]; then
              mkdir -p /etc/systemd/system/nginx.service.d
              cp -a /opt/rackula-etc-backup/nginx-override.conf /etc/systemd/system/nginx.service.d/override.conf 2>/dev/null || true
            fi
          fi
          systemctl daemon-reload
          systemctl start rackula-api || true
          systemctl start nginx || true
          msg_error "Update failed, restored from backup"
        fi
      fi
    fi
    # Drop transient staging/backup/download dirs (no-ops if absent or already consumed).
    rm -rf /opt/rackula.new /opt/rackula-etc-backup "${_DL_TMPDIR:-}" 2>/dev/null || true
  }
  trap cleanup EXIT

  if check_for_gh_release "rackula" "RackulaLives/Rackula"; then
    # Stage the new release into a scratch dir first. Download the tarball and
    # its SHA256 checksum, verify integrity, then extract. Services stay up and
    # the live install is untouched, so any failure here leaves the running
    # install fully intact.
    #
    # NOTE: This deliberately replaces fetch_and_deploy_gh_release (see
    # docs/research/lxc-best-practices.md) so the SHA256 checksum is verified
    # BEFORE any live files are touched. The standard helper extracts before we
    # could verify, which defeats the integrity guarantee.
    msg_info "Fetching ${APP} ${CHECK_UPDATE_RELEASE}"
    rm -rf /opt/rackula.new

    _DL_TMPDIR=$(mktemp -d) || { msg_error "Cannot create temp dir for download"; exit 1; }
    _TARBALL_NAME="rackula-lxc-${CHECK_UPDATE_RELEASE}.tar.gz"
    _TARBALL_URL="https://github.com/RackulaLives/Rackula/releases/download/${CHECK_UPDATE_RELEASE}/${_TARBALL_NAME}"
    _CHECKSUM_URL="${_TARBALL_URL}.sha256"

    # Download tarball and SHA256 checksum
    if ! curl_download "$_DL_TMPDIR/$_TARBALL_NAME" "$_TARBALL_URL"; then
      msg_error "Failed to download tarball from ${_TARBALL_URL}"
      rm -rf "$_DL_TMPDIR" /opt/rackula.new
      exit 1
    fi
    if ! curl_download "$_DL_TMPDIR/${_TARBALL_NAME}.sha256" "$_CHECKSUM_URL"; then
      msg_error "Failed to download SHA256 checksum"
      rm -rf "$_DL_TMPDIR" /opt/rackula.new
      exit 1
    fi

    # Verify SHA256 integrity before extraction
    _EXPECTED_HASH=$(awk '{print $1}' "$_DL_TMPDIR/${_TARBALL_NAME}.sha256")
    _ACTUAL_HASH=$(sha256sum "$_DL_TMPDIR/$_TARBALL_NAME" | awk '{print $1}')
    if [[ "$_EXPECTED_HASH" != "$_ACTUAL_HASH" ]]; then
      msg_error "SHA256 verification failed for ${_TARBALL_NAME}"
      msg_error "Expected: ${_EXPECTED_HASH}"
      msg_error "Actual:   ${_ACTUAL_HASH}"
      rm -rf "$_DL_TMPDIR" /opt/rackula.new
      exit 1
    fi
    msg_ok "SHA256 checksum verified"

    # Extract verified tarball to staging directory
    mkdir -p /opt/rackula.new
    tar --no-same-owner -xzf "$_DL_TMPDIR/$_TARBALL_NAME" -C "$_DL_TMPDIR" || {
      msg_error "Failed to extract tarball"
      rm -rf "$_DL_TMPDIR" /opt/rackula.new
      exit 1
    }
    # The tarball contains a top-level rackula-lxc-vX.Y.Z/ wrapper directory.
    # Find and copy its contents into the staging directory, including dotfiles.
    _UNPACK_DIR=$(find "$_DL_TMPDIR" -mindepth 1 -maxdepth 1 -type d | head -n1)
    if [[ -n "$_UNPACK_DIR" ]]; then
      cp -a "$_UNPACK_DIR"/. /opt/rackula.new/ || {
        msg_error "Failed to copy release files to /opt/rackula.new"
        rm -rf "$_DL_TMPDIR" /opt/rackula.new
        exit 1
      }
    fi
    rm -rf "$_DL_TMPDIR"

    # Verify structure before touching the live install (matches build-lxc.yml).
    for _d in config api frontend; do
      if [[ ! -d "/opt/rackula.new/${_d}" ]] || [[ -z "$(ls -A "/opt/rackula.new/${_d}" 2>/dev/null)" ]]; then
        msg_error "Release did not populate ${_d}/, aborting before touching live install"
        rm -rf /opt/rackula.new
        exit 1
      fi
    done

    # Write version marker (strip leading 'v' for consistency with check_for_gh_release)
    echo "${CHECK_UPDATE_RELEASE#v}" > ~/.rackula

    msg_ok "Fetched ${APP} ${CHECK_UPDATE_RELEASE}"

    msg_info "Stopping Services"
    systemctl stop rackula-api
    systemctl stop nginx
    msg_ok "Stopped Services"

    # Swap the staged release into place.
    msg_info "Installing ${APP} ${CHECK_UPDATE_RELEASE}"
    rm -rf /opt/rackula-backup
    mv /opt/rackula /opt/rackula-backup
    # The live tree is now the backup, so arm rollback: only from here can the
    # EXIT trap restore /opt/rackula-backup, and only this run could have created it.
    SWAP_STARTED=1
    mv /opt/rackula.new /opt/rackula

    # Restore persistent data from backup
    if ! mv /opt/rackula-backup/data /opt/rackula/data; then
      msg_error "Failed to restore data directory"
      exit 1
    fi

    # Back up the current /etc unit + nginx files before overwriting them, so the
    # rollback can restore a fully working previous install. A missing source is
    # fine (skip it), but a real copy failure must abort so we never overwrite
    # /etc without a usable backup.
    rm -rf /opt/rackula-etc-backup
    mkdir -p /opt/rackula-etc-backup
    while IFS='|' read -r etc_src etc_dest; do
      [[ -e "$etc_src" ]] || continue
      if ! cp -a "$etc_src" "/opt/rackula-etc-backup/${etc_dest}"; then
        msg_error "Failed to back up ${etc_src} before update"
        exit 1
      fi
    done <<'ETC_FILES'
/etc/nginx/sites-available/rackula|rackula
/etc/nginx/snippets/security-headers.conf|security-headers.conf
/etc/systemd/system/rackula-api.service|rackula-api.service
/etc/systemd/system/nginx.service.d/override.conf|nginx-override.conf
ETC_FILES

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

    # Remove transient backups only after services verified
    rm -rf /opt/rackula-backup /opt/rackula-etc-backup
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