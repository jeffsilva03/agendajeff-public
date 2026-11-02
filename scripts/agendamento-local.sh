#!/usr/bin/env bash
# Grava no Vault local a URL da função (pela rede interna do Docker) e o CRON_SECRET de supabase/.env.
set -euo pipefail
segredo=$(grep '^CRON_SECRET=' supabase/.env | cut -d= -f2)
docker exec -i supabase_db_Agenda_Jeff psql -U postgres -v ON_ERROR_STOP=1 \
  -v url="http://supabase_kong_Agenda_Jeff:8000/functions/v1/lembretes" -v segredo="$segredo" < scripts/configurar-agendamento.sql
echo "Agendamento local configurado."
