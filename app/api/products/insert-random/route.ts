import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { CATEGORIES } from "@/lib/types";

// Inserts N random products with created_at = now(). Used to DEMO consistency:
// while someone is paginating older pages, these brand-new rows appear only at
// the very top (before any cursor they hold), so they never duplicate or skip
// rows the user is currently scrolling through.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Accept count from JSON body or ?count=, default 5, clamp 1..100.
  let count = 5;
  try {
    const body = await req.json();
    if (body && typeof body.count === "number") count = body.count;
  } catch {
    // no/invalid body is fine — fall back to query param / default
  }
  const qpCount = Number(req.nextUrl.searchParams.get("count"));
  if (Number.isFinite(qpCount) && qpCount > 0) count = qpCount;
  count = Math.min(100, Math.max(1, Math.trunc(count)));

  const categories = CATEGORIES as unknown as string[];

  // Single statement insert via generate_series, created_at = now().
  // sql.array(...) sends the categories as one typed text[] parameter, then we
  // pick a random element per generated row.
  const inserted = await sql<{ id: string; name: string; created_at: string }[]>`
    INSERT INTO products (name, category, price, created_at, updated_at)
    SELECT
      'LIVE Product ' || g,
      (${sql.array(categories)})[1 + floor(random() * ${categories.length})::int],
      round((random() * 999 + 1)::numeric, 2),
      now(),
      now()
    FROM generate_series(1, ${count}) AS g
    RETURNING id::text AS id, name, created_at
  `;

  return NextResponse.json({ inserted: inserted.length, rows: inserted });
}
