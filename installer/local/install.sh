#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
command -v python3 >/dev/null || { echo 'PYTHON_REQUIRED: Python 3 is required. See the offline prerequisites guide.' >&2; exit 2; }
exec python3 "$ROOT/cli.py" "$@"
