-- ============================================================================
-- Schema + seed for keyset (cursor) pagination over ~200k products.
--
-- Run this whole file once against your Supabase database, e.g.:
--   psql "$DATABASE_URL" -f db/migration.sql
-- or paste it into the Supabase SQL editor.
--
-- (There is also a Node runner at scripts/seed.ts: `npm run seed`.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT          NOT NULL,
  category   TEXT          NOT NULL,
  price      NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL,
  updated_at TIMESTAMPTZ   NOT NULL
);

-- ----------------------------------------------------------------------------
-- 2. Seed 200,000 rows in ONE statement (no row-by-row loop).
--
--    - category randomized from 5 values
--    - price randomized 1.00 .. 1000.00
--    - created_at spread across the last 365 days, so "newest first" is real
--    - updated_at defaults to created_at here (immutable sort key is created_at)
--
--    Duplicate created_at values across rows are EXPECTED — that is exactly
--    why the (created_at, id) tiebreaker matters for pagination.
-- ----------------------------------------------------------------------------
INSERT INTO products (name, category, price, created_at, updated_at)
SELECT
  'Product ' || g                                    AS name,
  (ARRAY['Electronics','Books','Clothing','Home','Toys'])[1 + floor(random() * 5)::int] AS category,
  round((random() * 999 + 1)::numeric, 2)            AS price,
  ts                                                 AS created_at,
  ts                                                 AS updated_at
FROM generate_series(1, 200000) AS g
CROSS JOIN LATERAL (
  SELECT now() - (random() * interval '365 days') AS ts
) s;

-- ----------------------------------------------------------------------------
-- 3. Indexes that make keyset pagination an index range scan (fast at any depth)
--
--    The column order matches the ORDER BY exactly so Postgres can walk the
--    index in order and stop after LIMIT rows.
-- ----------------------------------------------------------------------------

-- Unfiltered "newest first" browse.
CREATE INDEX IF NOT EXISTS idx_products_created_id
  ON products (created_at DESC, id DESC);

-- Category-filtered "newest first" browse.
CREATE INDEX IF NOT EXISTS idx_products_category_created_id
  ON products (category, created_at DESC, id DESC);
