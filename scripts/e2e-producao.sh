#!/usr/bin/env bash
# Builda, sobe o app de produção na porta 3100 e roda a suíte (inclui o teste offline).
set -euo pipefail
# Pasta própria: compilar em .next enquanto o "npm run dev" roda corrompe o servidor de desenvolvimento.
export NEXT_DIST_DIR=.next-prod
npx next build
node node_modules/next/dist/bin/next start -p 3100 > /dev/null 2>&1 &  # node direto: o PID é o próprio servidor
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
until curl -s -o /dev/null http://localhost:3100/entrar; do sleep 1; done
# Por padrão só o teste offline: os demais usam ?data=, que a produção ignora de propósito.
E2E_URL=http://localhost:3100 npx playwright test "${@:-offline}"
