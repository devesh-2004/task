-- Schema + seed for keyset (cursor) pagination over ~200k products.
-- 1. Table
CREATE TABLE IF NOT EXISTS products (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT          NOT NULL,
  category   TEXT          NOT NULL,
  price      NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL,
  updated_at TIMESTAMPTZ   NOT NULL
);


-- 2. Seed 200,000 rows in ONE statement (no row-by-row loop).

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

-- 3. Indexes that make keyset pagination an index range scan (fast at any depth)

CREATE INDEX IF NOT EXISTS idx_products_created_id
  ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_category_created_id
  ON products (category, created_at DESC, id DESC);
