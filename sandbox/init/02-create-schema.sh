#!/bin/bash
set -e

# Apply schema to all 4 databases
for DB in sandbox_dev sandbox_stage sandbox_prod sandbox_dev2; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<-'EOSQL'
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      source VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      parent_slug VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE data_checks (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      source_layer VARCHAR(50) NOT NULL,
      target_layer VARCHAR(50) NOT NULL,
      field VARCHAR(100) NOT NULL,
      expected_value TEXT,
      actual_value TEXT,
      severity VARCHAR(20) NOT NULL DEFAULT 'warning',
      detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMP
    );

    CREATE INDEX idx_products_code ON products(code);
    CREATE INDEX idx_data_checks_code ON data_checks(code);
    CREATE INDEX idx_data_checks_severity ON data_checks(severity);
EOSQL
  echo "Schema created for $DB"
done

# Grant toad_reader SELECT on stage/prod tables
# This runs after schema creation so all tables exist
for DB in sandbox_stage sandbox_prod; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB" <<-EOSQL
    GRANT USAGE ON SCHEMA public TO toad_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO toad_reader;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO toad_reader;
EOSQL
  echo "Read-only grants applied for $DB"
done
