export type Cursor = {
  created_at: string; 
  id: string; 
};

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

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

  if (Number.isNaN(Date.parse(created_at))) {
    throw new Error("Cursor created_at is not a valid timestamp");
  }
  if (!/^\d+$/.test(id)) {
    throw new Error("Cursor id is not a valid integer");
  }

  return { created_at, id };
}
