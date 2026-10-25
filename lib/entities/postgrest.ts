import { z } from "zod";

import type { SortDirection, SortKey } from "@/lib/entities/query-state";

/**
 * Pure helpers for building PostgREST logic-tree filters safely.
 *
 * supabase-js passes `.or()` strings through verbatim, so any user-derived
 * value placed in one MUST be double-quoted, with `\` and `"` escaped, or a
 * name containing `,` `.` `(` `)` could alter the filter. Values are never
 * interpolated into SQL — PostgREST parameterises them.
 */

export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** `%term%` with LIKE wildcards in the user's term escaped. */
export function toContainsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function buildSearchFilter(fields: readonly string[], term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || fields.length === 0) return null;
  const pattern = quotePostgrestValue(toContainsPattern(trimmed));
  return fields.map((field) => `${field}.ilike.${pattern}`).join(",");
}

/* ---------------------------------------------------------------- cursors */

export const SORT_COLUMNS: Record<SortKey, "display_order" | "name" | "created_at" | "updated_at"> = {
  manual: "display_order",
  name: "name",
  created_at: "created_at",
  updated_at: "updated_at",
};

export type ListCursor = {
  /** Sort the cursor was produced for — a stale cursor is rejected. */
  s: SortKey;
  d: SortDirection;
  /** Value of the sort column on the last row (display_order may be null). */
  v: string | number | null;
  id: string;
};

const cursorSchema = z.object({
  s: z.enum(["manual", "name", "created_at", "updated_at"]),
  d: z.enum(["asc", "desc"]),
  v: z.union([z.string().max(256), z.number().int(), z.null()]),
  id: z.uuid(),
});

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeCursor(cursor: ListCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/** Returns `null` for anything malformed or inconsistent with the active sort. */
export function decodeCursor(raw: string, sort: SortKey, dir: SortDirection): ListCursor | null {
  if (raw.length > 1024) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(fromBase64Url(raw)));
    if (!parsed.success) return null;
    const cursor = parsed.data;
    if (cursor.s !== sort || cursor.d !== dir) return null;
    if (sort === "manual" && cursor.v !== null && typeof cursor.v !== "number") return null;
    if (sort !== "manual" && typeof cursor.v !== "string") return null;
    return cursor;
  } catch {
    return null;
  }
}

/**
 * Keyset condition for "rows after the cursor" under ORDER BY <col> <dir>, id <dir>.
 * Manual order is `display_order ASC NULLS LAST, id ASC`, so NULLs form a
 * trailing block that is paged by id alone.
 */
export function buildCursorFilter(cursor: ListCursor): string {
  const column = SORT_COLUMNS[cursor.s];
  const id = cursor.id;

  if (cursor.s === "manual") {
    if (cursor.v === null) {
      return `and(display_order.is.null,id.gt.${id})`;
    }
    const value = Number(cursor.v);
    return `display_order.gt.${value},and(display_order.eq.${value},id.gt.${id}),display_order.is.null`;
  }

  const op = cursor.d === "asc" ? "gt" : "lt";
  const value = quotePostgrestValue(String(cursor.v));
  return `${column}.${op}.${value},and(${column}.eq.${value},id.${op}.${id})`;
}

/** AND-combines independent OR groups into a single `or=(...)` expression. */
export function combineOrGroups(groups: readonly (string | null)[]): string | null {
  const present = groups.filter((group): group is string => Boolean(group));
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return `and(${present.map((group) => `or(${group})`).join(",")})`;
}
