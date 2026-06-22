# Keyset Product Browser

A product-browsing backend + minimal UI that paginates **~200,000 products**,
newest first, filterable by category — using **keyset (cursor) pagination** so
it stays **fast at any depth** and **consistent while data changes**.

Stack: Next.js 14 (App Router) + TypeScript, Tailwind, Supabase Postgres, raw
SQL via [`postgres`](https://github.com/porsager/postgres) (postgres.js) over the
Supabase pooled connection (port 6543).

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure DB
cp .env.example .env
#    then paste your Supabase POOLED connection string into DATABASE_URL

# 3. Create schema + seed 200k rows + indexes
npm run seed
#    (or: psql "$DATABASE_URL" -f db/migration.sql)

# 4. Run
npm run dev
#    open http://localhost:3000
```

---

## Environment / connection string

`.env` needs one variable, `DATABASE_URL`, pointing at the **Transaction pooler**
(port **6543**), not the direct connection (5432):

```
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

Find it in **Supabase → Project Settings → Database → Connection string →
Transaction pooler**.

Why the pooler: on serverless (Vercel) each function instance opens its own DB
connection. Postgres has a low connection ceiling, so we go through Supabase's
transaction pooler and keep `max: 1` per instance. The pooler doesn't support
prepared statements, so the client sets `prepare: false` (see [lib/db.ts](lib/db.ts)).

---

## How it works

### Schema ([db/migration.sql](db/migration.sql))

```sql
products(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT, category TEXT, price NUMERIC(10,2),
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
```

Seeded with **one** `INSERT ... SELECT ... FROM generate_series(1, 200000)` —
no row-by-row loop. Category is random over 5 values, price is random, and
`created_at` is spread across the last 365 days so "newest first" is meaningful.

Indexes match the sort order exactly so each page is an index range scan:

```sql
(created_at DESC, id DESC)             -- unfiltered browse
(category, created_at DESC, id DESC)   -- category-filtered browse
```

### API — `GET /api/products` ([app/api/products/route.ts](app/api/products/route.ts))

Params: `limit` (default 20, clamped 1–100), `category` (optional), `cursor`
(optional, opaque base64).

```sql
SELECT id, name, category, price, created_at, updated_at
FROM products
WHERE category = $cat                                   -- only if provided
  AND (created_at, id) < ($cursorTs, $cursorId)         -- omitted on page 1
ORDER BY created_at DESC, id DESC
LIMIT $limit + 1                                          -- +1 to detect next page
```

We fetch `limit + 1` rows; if we got the extra one there's a next page. We
return at most `limit` rows plus a `nextCursor` built from the last returned
row's `(created_at, id)`.

Response:

```json
{ "products": [...], "nextCursor": "base64…|null", "hasMore": true }
```

The cursor is base64url JSON of `{created_at, id}` — see [lib/cursor.ts](lib/cursor.ts).
Decoding validates the shape, the timestamp, and that `id` is an integer; a bad
cursor returns **400**.

### Demo consistency — `POST /api/products/insert-random`

Inserts N random products with `created_at = now()`
([app/api/products/insert-random/route.ts](app/api/products/insert-random/route.ts)).
Body `{ "count": 5 }` or `?count=5`, clamped 1–100. The UI has a button for it.

To see consistency live: scroll a few pages down, click **Insert 5 random**,
keep scrolling. The new rows have `created_at = now()`, which is *newer* than any
cursor you currently hold, so they sit above your scroll position — you never see
a duplicate and never skip a row. Reload from the top to see them appear.

---

## Why keyset over offset (the interview answer)

- **`OFFSET` is O(n) at depth and shifts under writes.** `LIMIT 20 OFFSET 100000`
  forces Postgres to walk and discard 100k rows every request — slow deep in the
  list. Worse, OFFSET counts *positions*, so if rows are inserted/deleted while
  you browse, the window slides: you re-see a row you already saw (**duplicate**)
  or jump past one you never saw (**skip**).

- **Keyset pages by a value, not a position.** `WHERE (created_at, id) < (cursor)`
  always means "the rows after this exact item," independent of how many rows
  exist before it. With the matching index it's an index range scan that starts
  where you left off and reads only `limit + 1` rows — **constant time at any
  depth**, and immune to inserts/deletes elsewhere.

- **The `id` tiebreaker is mandatory.** Many rows share the same `created_at`. If
  you sort by `created_at` alone, the boundary between two pages can fall in the
  middle of a group of equal timestamps, and rows in that group get **skipped or
  duplicated** because their order isn't deterministic. `(created_at DESC, id DESC)`
  is a total order, and the row-value comparison `(created_at, id) < (…)` picks up
  exactly where the previous page ended.

- **Sort by `created_at`, not `updated_at`.** Keyset consistency relies on the
  sort key being **immutable**. `created_at` never changes, so a row can't move
  within the ordering after you've paged past it. `updated_at` changes on edit: a
  row you already saw could jump back to the top and reappear (duplicate), or one
  ahead of you could move and be skipped. So `created_at` is the sort key;
  `updated_at` is just data.

---

## What I'd improve with more time

- **`updated_at` "freshness" view via a snapshot.** If a sort-by-recently-updated
  view is needed, do it consistently by snapshotting a boundary (e.g. capture
  `max(updated_at)` / a txid at browse start and page within `updated_at <=
  snapshot`), so the mutable column can't cause dupes/skips.
- **Covering index.** Add the selected columns via `INCLUDE (...)` so reads are
  index-only and never touch the heap.
- **Bidirectional cursor.** Encode a direction in the cursor and support paging
  backwards (`>` with `ASC` then reverse) for "previous page".
- **Total/approx counts** via `reltuples` estimates instead of exact `COUNT(*)`,
  plus request validation with zod and rate limiting on the insert endpoint.

---

## Deploy (Vercel + Supabase)

1. Create a Supabase project; run `db/migration.sql` (SQL editor or
   `npm run seed`) to create the schema, seed 200k rows, and build the indexes.
2. Push this repo to GitHub and import it into Vercel.
3. In Vercel → Project → Settings → Environment Variables, set `DATABASE_URL` to
   the Supabase **pooled** (6543) connection string.
4. Deploy. The API routes are `force-dynamic` so they run per-request, and the
   `prepare: false` / `max: 1` client settings keep the serverless functions
   compatible with the transaction pooler.

---

## Project layout

```
app/
  page.tsx                          # UI: filter, list, infinite scroll, insert button
  layout.tsx, globals.css
  api/products/route.ts             # GET: keyset pagination
  api/products/insert-random/route.ts  # POST: insert N rows with created_at=now()
lib/
  db.ts                             # shared postgres.js client (pooler-safe)
  cursor.ts                         # base64 cursor encode/decode + validation
  types.ts                          # shared types + category list
db/migration.sql                    # schema + 200k seed + indexes
scripts/seed.ts                     # runs migration.sql (npm run seed)
```
