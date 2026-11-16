#!/usr/bin/env bash
set -euo pipefail

export ASTERISK_PGSQL_HOST="${ASTERISK_PGSQL_HOST:-127.0.0.1}"
export ASTERISK_PGSQL_PORT="${ASTERISK_PGSQL_PORT:-5432}"
export ASTERISK_PGSQL_DB="${ASTERISK_PGSQL_DB:-postgres}"
export ASTERISK_PGSQL_USER="${ASTERISK_PGSQL_USER:-postgres}"
export ASTERISK_PGSQL_PASSWORD="${ASTERISK_PGSQL_PASSWORD:-}"
export VOIP_PUBLIC_IP="${VOIP_PUBLIC_IP:-127.0.0.1}"
export VOIP_STUN_SERVER="${VOIP_STUN_SERVER:-127.0.0.1:3478}"
export KALAMAPP_WEBHOOK_URL="${KALAMAPP_WEBHOOK_URL:-http://127.0.0.1:8000/functions/v1/voip-call-webhook}"
export KALAMAPP_VOIP_INTERNAL_SECRET="${KALAMAPP_VOIP_INTERNAL_SECRET:-}"

envsubst < /etc/asterisk/res_pgsql.conf.template > /etc/asterisk/res_pgsql.conf
envsubst '${KALAMAPP_WEBHOOK_URL} ${KALAMAPP_VOIP_INTERNAL_SECRET}' < /etc/asterisk/extensions.conf.template > /etc/asterisk/extensions.conf
envsubst '${VOIP_PUBLIC_IP}' < /etc/asterisk/pjsip.conf.template > /etc/asterisk/pjsip.conf

chown asterisk:asterisk /etc/asterisk/res_pgsql.conf /etc/asterisk/extensions.conf
chmod 640 /etc/asterisk/res_pgsql.conf /etc/asterisk/extensions.conf

asterisk -f -U asterisk -G asterisk -vvv &
asterisk_pid=$!
python3 /usr/local/bin/kalamapp-bridge-worker.py &
bridge_worker_pid=$!
python3 /usr/local/bin/kalamapp-voice-worker.py &
voice_worker_pid=$!
trap 'kill "$voice_worker_pid" "$bridge_worker_pid" "$asterisk_pid" 2>/dev/null || true; wait || true' EXIT INT TERM
# A failed subprocess must not leave a seemingly healthy container behind.
set +e
wait -n "$asterisk_pid" "$bridge_worker_pid" "$voice_worker_pid"
worker_status=$?
exit "$worker_status"
