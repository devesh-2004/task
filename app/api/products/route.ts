import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import type { Product } from "@/lib/types";

// Keyset (cursor) pagination over products, newest first.
// No LIMIT/OFFSET anywhere — we page by (created_at, id) so the result stays
// consistent (no dupes, no skips) even while rows are inserted mid-browse.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // limit: default 20, clamped to 1..100.
  const rawLimit = Number(params.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
    : 20;

  const category = params.get("category") || null;

  // Decode the cursor (if any). A bad cursor is a client error -> 400.
  const rawCursor = params.get("cursor");
  let cursor: { created_at: string; id: string } | null = null;
  if (rawCursor) {
    try {
      cursor = decodeCursor(rawCursor);
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Invalid cursor" },
        { status: 400 }
      );
    }
  }

  // Fetch limit + 1 rows: the extra row tells us whether a next page exists
  // without a second COUNT query. We return at most `limit` to the client.
  const fetchCount = limit + 1;

  // Build the query with conditional fragments. postgres.js parameterizes every
  // interpolated value, so this is injection-safe despite being "raw SQL".
  //
  // Resulting query (page 1, no category):
  //   SELECT ... FROM products
  //   ORDER BY created_at DESC, id DESC
  //   LIMIT $1
  //
  // Resulting query (deep page, with category):
  //   SELECT ... FROM products
  //   WHERE category = $1
  //     AND (created_at, id) < ($2, $3)
  //   ORDER BY created_at DESC, id DESC
  //   LIMIT $4
  const categoryFilter = category ? sql`category = ${category}` : sql``;

  // Row-value comparison: (created_at, id) < (cursorTs, cursorId). This is the
  // exact, single-expression way to express "strictly after this row" in
  // (created_at DESC, id DESC) order, and it maps cleanly onto the composite
  // index. The id tiebreaker is what prevents skipping/duplicating rows that
  // share a created_at.
  const cursorFilter = cursor
    ? sql`(created_at, id) < (${cursor.created_at}::timestamptz, ${cursor.id}::bigint)`
    : sql``;

  // Stitch WHERE together only from the clauses that are actually present.
  const where =
    category && cursor
      ? sql`WHERE ${categoryFilter} AND ${cursorFilter}`
      : category
        ? sql`WHERE ${categoryFilter}`
        : cursor
          ? sql`WHERE ${cursorFilter}`
          : sql``;

  const rows = await sql<Product[]>`
    SELECT
      id::text          AS id,
      name,
      category,
      price::text       AS price,
      created_at,
      updated_at
    FROM products
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ${fetchCount}
  `;

  const hasMore = rows.length > limit;
  const products = hasMore ? rows.slice(0, limit) : rows;

  const last = products[products.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          created_at: new Date(last.created_at).toISOString(),
          id: String(last.id),
        })
      : null;

  return NextResponse.json({ products, nextCursor, hasMore });
}
