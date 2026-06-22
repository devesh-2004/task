// This is just a convenience wrapper so need psql installed; 
// the migration.sql file is equally runnable by hand.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
  }

  const sql = postgres(url, { max: 1, prepare: false });

  const file = join(process.cwd(), "db", "migration.sql");
  const migration = readFileSync(file, "utf8");

  console.log("Running migration + seed (200k rows, this can take a moment)...");
  const start = Date.now();

  // `.unsafe` runs the raw multi-statement SQL file as-is.
  await sql.unsafe(migration);

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products
  `;

  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s. products row count: ${count}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});