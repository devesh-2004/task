import postgres from "postgres";

// Important for Supabase's TRANSACTION POOLER (port 6543):
type Sql = ReturnType<typeof postgres>;

declare global {
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

export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const value = (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
