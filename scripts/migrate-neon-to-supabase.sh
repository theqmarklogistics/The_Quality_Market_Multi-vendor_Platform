#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Migrate the Postgres data from Neon → Supabase.
#
# Both ends are plain PostgreSQL, so this is a data-only pg_dump/restore. The
# schema on Supabase is created by Prisma migrations (step 2) so Prisma's own
# migration history (_prisma_migrations) stays consistent afterwards.
#
# Prerequisites
#   • PostgreSQL client tools (pg_dump, psql) whose MAJOR version is >= the
#     Supabase server version (17). On Windows, install "PostgreSQL 17" and use
#     its Git Bash / add its \bin to PATH, or run this inside WSL/Docker.
#   • The project's Node deps installed (npx prisma available).
#
# Usage
#   1. Fill in the two connection strings below (or export them beforehand):
#        export NEON_DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"
#        export SUPABASE_DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#      IMPORTANT: use each provider's DIRECT (non-pooler) connection here, NOT the
#      PgBouncer 6543 pooler — bulk dump/restore needs a real session.
#   2. bash scripts/migrate-neon-to-supabase.sh
#
# The script is idempotent-ish: rerunning re-applies migrations (no-op if already
# applied) and re-imports data. Re-importing into non-empty tables will hit unique
# violations — start from a fresh Supabase database for a clean run.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Source (Neon) — direct connection string. Strip Neon-only channel_binding param.
NEON_DATABASE_URL="${NEON_DATABASE_URL:-}"
# Target (Supabase) — DIRECT connection (port 5432), same value as DIRECT_URL in .env.
SUPABASE_DIRECT_URL="${SUPABASE_DIRECT_URL:-}"

if [[ -z "$NEON_DATABASE_URL" || -z "$SUPABASE_DIRECT_URL" ]]; then
  echo "ERROR: set NEON_DATABASE_URL and SUPABASE_DIRECT_URL first." >&2
  echo "       (Use the DIRECT connection strings, not the 6543 pooler.)" >&2
  exit 1
fi

# channel_binding=require is a Neon-only flag pg_dump/psql do not understand.
NEON_CLEAN_URL="$(printf '%s' "$NEON_DATABASE_URL" | sed -E 's/[?&]channel_binding=[^&]*//')"

DUMP_DIR="$(mktemp -d)"
DUMP_FILE="$DUMP_DIR/neon-data.sql"
trap 'rm -rf "$DUMP_DIR"' EXIT

echo "──────────────────────────────────────────────────────────────"
echo "Step 1/3 · Build the schema on Supabase via Prisma migrations"
echo "──────────────────────────────────────────────────────────────"
# prisma migrate deploy uses DIRECT_URL; point it at the Supabase target.
DIRECT_URL="$SUPABASE_DIRECT_URL" DATABASE_URL="$SUPABASE_DIRECT_URL" \
  npx prisma migrate deploy

echo "──────────────────────────────────────────────────────────────"
echo "Step 2/3 · Dump DATA ONLY from Neon"
echo "──────────────────────────────────────────────────────────────"
# --data-only        : schema already exists (from Prisma)
# --no-owner/-privs  : Supabase roles differ from Neon's
# --disable-triggers : load rows without firing FK/other triggers (needs superuser-
#                      like session; Supabase 'postgres' role supports it)
# Exclude Prisma's own migration bookkeeping table — migrate deploy already wrote it.
pg_dump "$NEON_CLEAN_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  --exclude-table-data='_prisma_migrations' \
  > "$DUMP_FILE"

echo "Dump written ($(wc -l < "$DUMP_FILE") lines)."

echo "──────────────────────────────────────────────────────────────"
echo "Step 3/3 · Restore DATA into Supabase"
echo "──────────────────────────────────────────────────────────────"
# ON_ERROR_STOP so a bad row aborts loudly instead of leaving partial data.
psql "$SUPABASE_DIRECT_URL" \
  --set ON_ERROR_STOP=on \
  --single-transaction \
  -f "$DUMP_FILE"

echo "──────────────────────────────────────────────────────────────"
echo "Done. Verify row counts, then repoint .env DATABASE_URL/DIRECT_URL"
echo "at Supabase and restart the app."
echo "──────────────────────────────────────────────────────────────"
