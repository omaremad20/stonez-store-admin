import { z } from "zod";

import { fromBase64Url, quotePostgrestValue, toBase64Url } from "@/lib/entities/postgrest";
import type { SortDirection } from "@/lib/entities/query-state";
import type { ProductSortKey } from "@/lib/products/query-state";

/** Keyset cursors for the products listing (same scheme as the entity listings). */

export const PRODUCT_SORT_COLUMNS: Record<ProductSortKey, "display_order" | "name" | "price" | "created_at" | "updated_at"> = {
  manual: "display_order",
  name: "name",
  price: "price",
  created_at: "created_at",
  updated_at: "updated_at",
};

export type ProductListCursor = {
  /** Sort the cursor was produced for — a stale cursor is rejected. */
  s: ProductSortKey;
  d: SortDirection;
  /** Value of the sort column on the last row (display_order may be null). */
  v: string | number | null;
  id: string;
};

const cursorSchema = z.object({
  s: z.enum(["manual", "name", "price", "created_at", "updated_at"]),
  d: z.enum(["asc", "desc"]),
  // zod 4: z.number() already rejects Infinity / NaN.
  v: z.union([z.string().max(256), z.number(), z.null()]),
  id: z.uuid(),
});

export function encodeProductCursor(cursor: ProductListCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/** Returns `null` for anything malformed or inconsistent with the active sort. */
export function decodeProductCursor(raw: string, sort: ProductSortKey, dir: SortDirection): ProductListCursor | null {
  if (raw.length > 1024) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(fromBase64Url(raw)));
    if (!parsed.success) return null;
    const cursor = parsed.data;
    if (cursor.s !== sort || cursor.d !== dir) return null;
    if (sort === "manual" && cursor.v !== null && !Number.isInteger(cursor.v)) return null;
    if (sort === "price" && typeof cursor.v !== "number") return null;
    if ((sort === "name" || sort === "created_at" || sort === "updated_at") && typeof cursor.v !== "string") return null;
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
export function buildProductCursorFilter(cursor: ProductListCursor): string {
  const column = PRODUCT_SORT_COLUMNS[cursor.s];
  const id = cursor.id;

  if (cursor.s === "manual") {
    if (cursor.v === null) return `and(display_order.is.null,id.gt.${id})`;
    const value = Number(cursor.v);
    return `display_order.gt.${value},and(display_order.eq.${value},id.gt.${id}),display_order.is.null`;
  }

  const op = cursor.d === "asc" ? "gt" : "lt";
  // Numbers are emitted as-is (validated finite); strings are quoted/escaped.
  const value = typeof cursor.v === "number" ? String(cursor.v) : quotePostgrestValue(String(cursor.v));
  return `${column}.${op}.${value},and(${column}.eq.${value},id.${op}.${id})`;
}
