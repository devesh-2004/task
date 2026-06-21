// Opaque base64 cursor encoding {created_at, id}.
//
// The cursor is the (created_at, id) of the LAST row of the page just returned.
// The next page asks for rows strictly "after" it in (created_at DESC, id DESC)
// order — that is what makes pagination keyset-based and insert-safe.

export type Cursor = {
  created_at: string; // ISO timestamp
  id: string; // BIGINT serialized as string to avoid JS number precision loss
};

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

// Throws on malformed input so the API layer can map it to a 400.
export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Cursor is not valid base64 JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Cursor).created_at !== "string" ||
    typeof (parsed as Cursor).id !== "string"
  ) {
    throw new Error("Cursor is missing required fields");
  }

  const { created_at, id } = parsed as Cursor;

  // Validate the parts so a tampered cursor can't reach SQL as garbage.
  if (Number.isNaN(Date.parse(created_at))) {
    throw new Error("Cursor created_at is not a valid timestamp");
  }
  if (!/^\d+$/.test(id)) {
    throw new Error("Cursor id is not a valid integer");
  }

  return { created_at, id };
}
