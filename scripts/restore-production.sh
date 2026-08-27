#!/usr/bin/env bash
set -euo pipefail

compose_file="${ERP_COMPOSE_FILE:-compose.production.yml}"
env_file="${ERP_ENV_FILE:-.env.production}"
backup_root="${ERP_BACKUP_ROOT:-.runtime/backups}"
asset_root="${ERP_ASSET_HOST_ROOT:-.runtime/assets}"
backup_id="${1:-}"

if [[ "${RESTORE_CONFIRM:-}" != "restore-erp-production" ]]; then
  echo "refusing restore: set RESTORE_CONFIRM=restore-erp-production" >&2
  exit 1
fi
if [[ -z "${backup_id}" || ! "${backup_id}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "usage: RESTORE_CONFIRM=restore-erp-production bash scripts/restore-production.sh YYYYMMDDTHHMMSSZ" >&2
  exit 1
fi

source_dir="${backup_root}/${backup_id}"
if [[ ! -f "${source_dir}/database.dump" || ! -f "${source_dir}/assets.tar.gz" || ! -f "${source_dir}/SHA256SUMS" ]]; then
  echo "backup set is incomplete: ${source_dir}" >&2
  exit 1
fi

(cd "${source_dir}" && sha256sum --check SHA256SUMS)
if tar -tzf "${source_dir}/assets.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "asset archive contains an unsafe path" >&2
  exit 1
fi

read_env_value() {
  local key="$1" line value
  line="$(grep -m1 -E "^${key}=" "${env_file}" || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "${value}" == \"*\" || "${value}" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB)}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

docker compose --env-file "${env_file}" -f "${compose_file}" stop app scheduler
docker compose --env-file "${env_file}" -f "${compose_file}" exec -T db \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  < "${source_dir}/database.dump"

mkdir -p "${asset_root}"
tar -C "${asset_root}" -xzf "${source_dir}/assets.tar.gz"
docker compose --env-file "${env_file}" -f "${compose_file}" up -d app scheduler

echo "restore complete: ${backup_id}"
