import "server-only";

import { z } from "zod";

import { EntityRequestError, fromPostgresCode } from "@/lib/entities/errors";
import { buildSearchFilter, combineOrGroups } from "@/lib/entities/postgrest";
import { BARCODE_PATTERN } from "@/lib/products/constants";
import {
  buildProductCursorFilter,
  encodeProductCursor,
  PRODUCT_SORT_COLUMNS,
  type ProductListCursor,
} from "@/lib/products/cursor";
import { PRODUCTS_PAGE_SIZE, type ProductQueryState } from "@/lib/products/query-state";
import type { ProductListItem, ProductListPage, RelationRef } from "@/lib/products/types";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * One query per batch: the product row, its brand / category (+ department) /
 * collection and a variant COUNT are embedded, so the table never issues
 * per-row requests.
 */
const LIST_COLUMNS = [
  "id",
  "name",
  "price",
  "discount",
  "is_active",
  "display_order",
  "cover_image_url",
  "label",
  "label_color",
  "label_bg",
  "created_at",
  "updated_at",
  "brand:brands(id,name,is_active)",
  "category:categories(id,name,is_active,department:departments(id,name,is_active))",
  "collection:collections(id,name,is_active)",
  "variants(count)",
].join(",");

const relationSchema = z.object({ id: z.string(), name: z.string(), is_active: z.boolean() });

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.coerce.number(),
  discount: z.coerce.number(),
  is_active: z.boolean(),
  display_order: z.number().int().nullable(),
  cover_image_url: z.string().nullable(),
  label: z.string().nullable(),
  label_color: z.string().nullable(),
  label_bg: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  brand: relationSchema.nullable(),
  category: relationSchema.extend({ department: relationSchema.nullable() }).nullable(),
  collection: relationSchema.nullable(),
  variants: z.array(z.object({ count: z.number() })),
});

type RawRow = z.infer<typeof rowSchema>;

export function toRelationRef(row: z.infer<typeof relationSchema> | null | undefined): RelationRef | null {
  return row ? { id: row.id, name: row.name, isActive: row.is_active } : null;
}

function toListItem(row: RawRow): ProductListItem {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    discount: row.discount,
    isActive: row.is_active,
    displayOrder: row.display_order,
    coverImageUrl: row.cover_image_url,
    label: row.label,
    labelColor: row.label_color,
    labelBg: row.label_bg,
    brand: toRelationRef(row.brand),
    category: toRelationRef(row.category),
    department: toRelationRef(row.category?.department),
    collection: toRelationRef(row.collection),
    variantCount: row.variants[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cursorFor(row: RawRow, state: ProductQueryState): ProductListCursor {
  const column = PRODUCT_SORT_COLUMNS[state.sort];
  return { s: state.sort, d: state.dir, v: row[column], id: row.id };
}

/** Category ids belonging to a department (or with no department) — the department filter. */
async function categoryIdsForDepartment(supabase: ServerSupabase, department: string): Promise<string[]> {
  let query = supabase.from("categories").select("id").limit(1000);
  query = department === "none" ? query.is("department_id", null) : query.eq("department_id", department);
  const { data, error, status } = await query;
  if (error) throw fromPostgresCode(error.code, status);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/** Exact 10-digit barcode → owning product (barcodes are unique). */
async function productIdForBarcode(supabase: ServerSupabase, barcode: string): Promise<string | null> {
  const { data, error, status } = await supabase.from("variants").select("product_id").eq("barcode", barcode).limit(1);
  if (error) throw fromPostgresCode(error.code, status);
  return (data?.[0] as { product_id: string } | undefined)?.product_id ?? null;
}

function idList(ids: string[]): string {
  // ids come from the database (uuid), never from user input.
  return `(${ids.join(",")})`;
}

/**
 * Products listing: filters, search, sort and keyset paging all run in the
 * database through the caller's session client (RLS applies). Exactly
 * PRODUCTS_PAGE_SIZE (25) rows per request; a full batch means "maybe more".
 */
export async function listProductsPage(
  supabase: ServerSupabase,
  state: ProductQueryState,
  cursor: ProductListCursor | null,
): Promise<ProductListPage> {
  let query = supabase.from("products").select(LIST_COLUMNS);

  if (state.status !== "all") query = query.eq("is_active", state.status === "active");

  for (const [key, column] of [
    ["brand", "brand_id"],
    ["category", "category_id"],
    ["collection", "collection_id"],
  ] as const) {
    const value = state[key];
    if (value) query = value === "none" ? query.is(column, null) : query.eq(column, value);
  }

  let departmentGroup: string | null = null;
  if (state.department) {
    const ids = await categoryIdsForDepartment(supabase, state.department);
    if (state.department === "none") {
      // No department = no category, or a category that has no department.
      departmentGroup = ids.length ? `category_id.is.null,category_id.in.${idList(ids)}` : "category_id.is.null";
    } else if (ids.length === 0) {
      return { items: [], nextCursor: null };
    } else {
      query = query.in("category_id", ids);
    }
  }

  let searchGroup = buildSearchFilter(["name"], state.q);
  if (searchGroup && BARCODE_PATTERN.test(state.q.trim())) {
    const productId = await productIdForBarcode(supabase, state.q.trim());
    if (productId) searchGroup = `${searchGroup},id.eq.${productId}`;
  }

  const logic = combineOrGroups([searchGroup, departmentGroup, cursor ? buildProductCursorFilter(cursor) : null]);
  if (logic) query = query.or(logic);

  const ascending = state.dir === "asc";
  query =
    state.sort === "manual"
      ? query.order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })
      : query.order(PRODUCT_SORT_COLUMNS[state.sort], { ascending }).order("id", { ascending });

  const { data, error, status } = await query.limit(PRODUCTS_PAGE_SIZE);
  if (error) throw fromPostgresCode(error.code, status);

  const parsed = z.array(rowSchema).safeParse(data);
  if (!parsed.success) {
    throw new EntityRequestError("server_error", "The server returned data in an unexpected format.", 500);
  }

  const rows = parsed.data;
  const last = rows.at(-1);
  // A full batch may be followed by more rows; the next request confirms the end.
  const hasMore = rows.length === PRODUCTS_PAGE_SIZE;

  return {
    items: rows.map(toListItem),
    nextCursor: hasMore && last ? encodeProductCursor(cursorFor(last, state)) : null,
  };
}
