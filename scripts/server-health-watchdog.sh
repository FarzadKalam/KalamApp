#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="${MONITOR_CONFIG_FILE:-/etc/kalamapp-monitor.env}"
if [[ -r "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

: "${MONITOR_BALE_BOT_TOKEN:?MONITOR_BALE_BOT_TOKEN is required}"
: "${MONITOR_BALE_CHAT_ID:?MONITOR_BALE_CHAT_ID is required}"

STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/kalamapp-monitor}"
ALERT_COOLDOWN_SECONDS="${MONITOR_ALERT_COOLDOWN_SECONDS:-900}"
DISK_PATH="${MONITOR_DISK_PATH:-/var/lib/docker}"
DISK_WARNING_PERCENT="${MONITOR_DISK_WARNING_PERCENT:-80}"
DISK_CRITICAL_PERCENT="${MONITOR_DISK_CRITICAL_PERCENT:-90}"
LOG_WINDOW="${MONITOR_LOG_WINDOW:-5m}"
REQUIRED_CONTAINERS="${MONITOR_REQUIRED_CONTAINERS:-supabase-db,supabase-rest,supabase-auth,supabase-kong,supabase-edge-functions,supabase-storage,kalamapp-gotenberg}"

mkdir -p "$STATE_DIR"
LOCK_DIR="$STATE_DIR/run.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

send_bale() {
  local message="$1"
  local escaped_message
  escaped_message="${message//\\/\\\\}"
  escaped_message="${escaped_message//\"/\\\"}"
  escaped_message="${escaped_message//$'\n'/\\n}"
  curl --fail --silent --show-error --max-time 10 \
    --request POST "https://tapi.bale.ai/bot${MONITOR_BALE_BOT_TOKEN}/sendMessage" \
    --header 'Content-Type: application/json' \
    --data "{\"chat_id\":\"${MONITOR_BALE_CHAT_ID}\",\"text\":\"${escaped_message}\"}" >/dev/null
}

alert_once() {
  local key="$1"
  local message="$2"
  local state_file="$STATE_DIR/${key//[^A-Za-z0-9_.-]/_}.last"
  local now last=0
  now="$(date +%s)"
  if [[ -r "$state_file" ]]; then
    last="$(cat "$state_file" 2>/dev/null || echo 0)"
  fi
  if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < ALERT_COOLDOWN_SECONDS )); then
    return 0
  fi
  printf '%s' "$now" > "$state_file"
  send_bale "⚠️ Kalamapp server alert\n${message}\nزمان: $(date -Is)" || true
}

disk_percent="$(df -P "$DISK_PATH" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
if [[ "$disk_percent" =~ ^[0-9]+$ ]]; then
  if (( disk_percent >= DISK_CRITICAL_PERCENT )); then
    alert_once 'disk-critical' "فضای دیسک ${DISK_PATH} به ${disk_percent}% رسیده است."
  elif (( disk_percent >= DISK_WARNING_PERCENT )); then
    alert_once 'disk-warning' "فضای دیسک ${DISK_PATH} به ${disk_percent}% رسیده است."
  fi
else
  alert_once 'disk-check-failed' "خواندن فضای دیسک ${DISK_PATH} ناموفق بود."
fi

IFS=',' read -r -a containers <<< "$REQUIRED_CONTAINERS"
for container in "${containers[@]}"; do
  container="${container//[[:space:]]/}"
  [[ -n "$container" ]] || continue
  running="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || echo false)"
  if [[ "$running" != 'true' ]]; then
    alert_once "container-${container}-stopped" "کانتینر ${container} در حال اجرا نیست."
    continue
  fi
  health="$(docker inspect --format '{{if .Config.Healthcheck}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo unknown)"
  if [[ "$health" == 'unhealthy' ]]; then
    alert_once "container-${container}-unhealthy" "وضعیت سلامت کانتینر ${container} unhealthy است."
  fi
done

if ! docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
  alert_once 'postgres-not-ready' 'PostgreSQL آمادهٔ پاسخ‌گویی نیست.'
fi

if docker logs --since "$LOG_WINDOW" supabase-rest 2>&1 | grep -Eq 'PGRST003|57014'; then
  alert_once 'postgrest-pool-or-timeout' "در ${LOG_WINDOW} اخیر، خطای pool یا timeout در PostgREST دیده شد."
fi

if [[ -n "${MONITOR_API_URL:-}" ]]; then
  api_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 "$MONITOR_API_URL" || true)"
  if [[ ! "$api_status" =~ ^[1-4][0-9][0-9]$ ]]; then
    alert_once 'public-api-unreachable' "API عمومی در دسترس نیست یا پاسخ 5xx دارد (HTTP ${api_status:-000})."
  fi
fi

if [[ -n "${MONITOR_HEARTBEAT_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 15 "$MONITOR_HEARTBEAT_URL" >/dev/null || \
    alert_once 'heartbeat-failed' 'ارسال heartbeat به مانیتور بیرونی ناموفق بود.'
fi
