#!/bin/bash
set -e

# ============================================================
# Seed data for all 4 environments
# Generates temp SQL files to avoid "Argument list too long"
# ============================================================

SOURCES=("api" "csv_import" "manual" "sync" "webhook")
STATUSES=("active" "inactive" "pending" "archived")
CURRENCIES=("USD" "EUR" "GBP" "JPY")
SEVERITIES=("critical" "warning" "info")
LAYERS=("source_db" "cache" "search_index" "api_response" "export")
FIELDS=("price" "title" "status" "currency" "weight" "category" "description")

seed_db() {
  local DB=$1
  local PRODUCT_COUNT=$2
  local CATEGORY_COUNT=$3
  local CHECK_COUNT=$4
  local INCLUDE_EDGE_CASES=${5:-false}
  local TMPFILE="/tmp/seed_${DB}.sql"

  echo "Seeding $DB: $PRODUCT_COUNT products, $CATEGORY_COUNT categories, $CHECK_COUNT data_checks"
  > "$TMPFILE"

  # --- categories ---
  for i in $(seq 1 "$CATEGORY_COUNT"); do
    local SLUG="cat-$(printf '%03d' $i)"
    local NAME="Category $i"
    local PARENT="NULL"
    if [ "$i" -gt 10 ]; then
      PARENT="'cat-$(printf '%03d' $(( (i % 10) + 1 )))'"
    fi
    local ACTIVE="true"
    if [ "$INCLUDE_EDGE_CASES" = true ] && [ $((i % 7)) -eq 0 ]; then
      ACTIVE="false"
    fi
    echo "INSERT INTO categories (slug, name, parent_slug, is_active) VALUES ('$SLUG', '$NAME', $PARENT, $ACTIVE);" >> "$TMPFILE"
  done

  # --- products ---
  for i in $(seq 1 "$PRODUCT_COUNT"); do
    local ITEM="ITEM-$(printf '%05d' $i)"
    local TITLE="Product $i"
    local PRICE="$(( (RANDOM % 9900) + 100 )).$(printf '%02d' $((RANDOM % 100)))"
    local CURRENCY="${CURRENCIES[$(( RANDOM % ${#CURRENCIES[@]} ))]}"
    local SOURCE="${SOURCES[$(( RANDOM % ${#SOURCES[@]} ))]}"
    local STATUS="${STATUSES[$(( RANDOM % ${#STATUSES[@]} ))]}"

    if [ "$INCLUDE_EDGE_CASES" = true ]; then
      if [ $((i % 5)) -eq 0 ]; then
        TITLE="Produit spécial $i"
      fi
      if [ $((i % 8)) -eq 0 ]; then
        ITEM="ITEM-ÜNÏ-$(printf '%03d' $i)"
      fi
      if [ $((i % 10)) -eq 0 ]; then
        PRICE="0.00"
      fi
    fi

    local SAFE_TITLE="${TITLE//\'/\'\'}"
    echo "INSERT INTO products (code, title, price, currency, source, status) VALUES ('$ITEM', '$SAFE_TITLE', $PRICE, '$CURRENCY', '$SOURCE', '$STATUS');" >> "$TMPFILE"
  done

  # --- data_checks ---
  for i in $(seq 1 "$CHECK_COUNT"); do
    local ITEM="ITEM-$(printf '%05d' $(( (RANDOM % PRODUCT_COUNT) + 1 )))"
    local SRC="${LAYERS[$(( RANDOM % ${#LAYERS[@]} ))]}"
    local TGT="${LAYERS[$(( RANDOM % ${#LAYERS[@]} ))]}"
    local FIELD="${FIELDS[$(( RANDOM % ${#FIELDS[@]} ))]}"
    local EXPECTED="'expected_val_$i'"
    local ACTUAL="'actual_val_$i'"
    local SEV="${SEVERITIES[$(( RANDOM % ${#SEVERITIES[@]} ))]}"
    local RESOLVED="NULL"
    if [ $((RANDOM % 3)) -eq 0 ]; then
      RESOLVED="NOW() - interval '1 day'"
    fi

    if [ "$INCLUDE_EDGE_CASES" = true ]; then
      if [ $((i % 4)) -eq 0 ]; then
        EXPECTED="NULL"
      fi
      if [ $((i % 6)) -eq 0 ]; then
        ACTUAL="NULL"
      fi
    fi

    echo "INSERT INTO data_checks (code, source_layer, target_layer, field, expected_value, actual_value, severity, resolved_at) VALUES ('$ITEM', '$SRC', '$TGT', '$FIELD', $EXPECTED, $ACTUAL, '$SEV', $RESOLVED);" >> "$TMPFILE"
  done

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" -f "$TMPFILE"
  rm "$TMPFILE"
  echo "Done seeding $DB"
}

seed_db "sandbox_dev"   100  20  150  false
seed_db "sandbox_stage" 1000 50  1500 false
seed_db "sandbox_prod"  500  80  3000 false
seed_db "sandbox_dev2"  50   10  80   true

echo "All databases seeded successfully!"
