import postgres from "postgres";

// Lazily-created, shared postgres.js client. We reuse it across hot reloads in
// dev and across invocations in a warm serverless container.
//
// It must be LAZY: `next build` imports route modules to collect page data, and
// DATABASE_URL isn't necessarily set at build time. Creating the client on
// first use (first query) instead of at import time keeps the build green.
//
// Important for Supabase's TRANSACTION POOLER (port 6543):
//   - prepare: false  -> the transaction pooler does not support prepared
//     statements; leaving this on causes "prepared statement already exists".
//   - max: 1          -> in serverless each container should hold very few
//     connections; the pooler multiplexes them server-side.

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
  });
  if (process.env.NODE_ENV !== "production") {
    global.__sql = client;
  }
  return client;
}

function getClient(): Sql {
  return global.__sql ?? createClient();
}

// A Proxy that defers client creation until the first call/property access, so
// callers keep using `sql\`...\`` and `sql.array(...)` unchanged.
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    // tagged template: sql`...` -> client(strings, ...values)
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const value = (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
