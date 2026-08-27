#!/usr/bin/env bash
set -euo pipefail

compose_file="${ERP_COMPOSE_FILE:-compose.production.yml}"
env_file="${ERP_ENV_FILE:-.env.production}"
backup_root="${ERP_BACKUP_ROOT:-.runtime/backups}"
asset_root="${ERP_ASSET_HOST_ROOT:-.runtime/assets}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
weekday="$(date -u +%u)"
week_key="$(date -u +%G-W%V)"
destination="${backup_root}/${timestamp}"
weekly_marker="${backup_root}/.weekly-${week_key}"

if [[ ! -f "${compose_file}" || ! -f "${env_file}" ]]; then
  echo "compose or production env file is missing" >&2
  exit 1
fi

mkdir -p "${destination}"

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
APP_VERSION="${APP_VERSION:-$(read_env_value APP_VERSION)}"
GIT_SHA="${GIT_SHA:-$(read_env_value GIT_SHA)}"
OSS_BACKUP_URI="${OSS_BACKUP_URI:-$(read_env_value OSS_BACKUP_URI)}"

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

docker compose --env-file "${env_file}" -f "${compose_file}" exec -T db \
  pg_dump --format=custom --no-owner --no-privileges --username "${POSTGRES_USER}" "${POSTGRES_DB}" \
  > "${destination}/database.dump"

if [[ -d "${asset_root}" ]]; then
  tar -C "${asset_root}" -czf "${destination}/assets.tar.gz" .
else
  tar -czf "${destination}/assets.tar.gz" --files-from /dev/null
fi

cat > "${destination}/manifest.txt" <<EOF
created_at=${timestamp}
app_version=${APP_VERSION:-unknown}
git_sha=${GIT_SHA:-unknown}
database=${POSTGRES_DB}
EOF

(cd "${destination}" && sha256sum database.dump assets.tar.gz manifest.txt > SHA256SUMS)

if [[ -n "${OSS_BACKUP_URI:-}" ]]; then
  command -v ossutil >/dev/null 2>&1 || {
    echo "OSS_BACKUP_URI is set but ossutil is not installed" >&2
    exit 1
  }
  ossutil cp -r -f "${destination}" "${OSS_BACKUP_URI%/}/daily/${timestamp}/"
  if [[ "${weekday}" == "7" && ! -e "${weekly_marker}" ]]; then
    ossutil cp -r -f "${destination}" "${OSS_BACKUP_URI%/}/weekly/${timestamp}/"
    touch "${weekly_marker}"
  fi
fi

while IFS= read -r -d '' expired; do
  name="$(basename "${expired}")"
  if [[ "${name}" =~ ^[0-9]{8}T[0-9]{6}Z$ && "${expired}" == "${backup_root}/"* ]]; then
    rm -rf -- "${expired}"
  fi
done < <(find "${backup_root}" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print0)
find "${backup_root}" -mindepth 1 -maxdepth 1 -type f -name '.weekly-*' -mtime +70 -delete

echo "backup complete: ${destination}"
