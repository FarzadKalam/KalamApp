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
envsubst < /etc/asterisk/extensions.conf.template > /etc/asterisk/extensions.conf

chown asterisk:asterisk /etc/asterisk/res_pgsql.conf /etc/asterisk/extensions.conf
chmod 640 /etc/asterisk/res_pgsql.conf /etc/asterisk/extensions.conf

exec asterisk -f -U asterisk -G asterisk -vvv
