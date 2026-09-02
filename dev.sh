#!/usr/bin/env bash
# Start all three dev servers. Ctrl-C stops everything.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

trap 'kill 0' EXIT INT TERM

echo "API    → http://localhost:8000"
echo "Public → http://localhost:5173"
echo "Admin  → http://localhost:5174"
echo

(cd backend && .venv/bin/python manage.py runserver 8000) &
(cd public-web && npm run dev) &
(cd admin-web && npm run dev) &

wait
