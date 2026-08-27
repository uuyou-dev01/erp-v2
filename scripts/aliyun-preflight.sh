#!/usr/bin/env bash
set -euo pipefail

# Read-only inventory for an Alibaba Cloud ECS host. This script deliberately
# makes no package, firewall, Docker or network changes.

section() {
  printf '\n[%s]\n' "$1"
}

section identity
hostnamectl 2>/dev/null || hostname
if [[ -r /etc/os-release ]]; then
  sed -n '1,20p' /etc/os-release
fi
uname -a

section compute
command -v lscpu >/dev/null 2>&1 && lscpu
command -v free >/dev/null 2>&1 && free -h
command -v swapon >/dev/null 2>&1 && swapon --show

section storage
df -hT
df -ih

section listening-ports
if command -v ss >/dev/null 2>&1; then
  ss -lntup
elif command -v netstat >/dev/null 2>&1; then
  netstat -lntup
else
  echo "ss/netstat unavailable"
fi

section reverse-proxy
for service in nginx caddy; do
  if command -v systemctl >/dev/null 2>&1; then
    systemctl is-enabled "$service" 2>/dev/null || true
    systemctl is-active "$service" 2>/dev/null || true
  fi
done
command -v nginx >/dev/null 2>&1 && nginx -T 2>&1 || true
command -v caddy >/dev/null 2>&1 && caddy version || true

section containers
if command -v docker >/dev/null 2>&1; then
  docker version
  docker compose version 2>/dev/null || true
  docker ps --no-trunc
  docker system df
else
  echo "docker unavailable"
fi

section network
command -v ip >/dev/null 2>&1 && ip route || true
command -v timedatectl >/dev/null 2>&1 && timedatectl || true

section result
echo "Read-only preflight complete. Review region in the Alibaba Cloud console and verify security-group rules separately."
