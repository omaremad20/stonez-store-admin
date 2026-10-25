import "server-only";

import { z } from "zod";

import { EntityRequestError, fromPostgresCode } from "@/lib/entities/errors";
import { toRelationRef } from "@/lib/products/list.server";
import type {
  CategoryOption,
  ProductDetail,
  ProductOptions,
  ProductVariant,
  RelationOption,
  VariantLockReason,
} from "@/lib/products/types";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

const relationSchema = z.object({ id: z.string(), name: z.string(), is_active: z.boolean() });

const variantSchema = z.object({
  id: z.string(),
  size: z.string(),
  color_hash: z.string(),
  color_name: z.string(),
  barcode: z.string(),
  stock: z.coerce.number(),
  is_active: z.boolean(),
  is_printed: z.boolean(),
  preorder_enabled: z.boolean(),
  maximum_preorder_quantity: z.coerce.number(),
  image_url: z.string().nullable(),
  image_storage_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  cart_items: z.array(z.object({ count: z.number() })).optional(),
});

const detailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.coerce.number(),
  discount: z.coerce.number(),
  label: z.string().nullable(),
  label_color: z.string().nullable(),
  label_bg: z.string().nullable(),
  is_active: z.boolean(),
  display_order: z.number().int().nullable(),
  cover_image_url: z.string().nullable(),
  cover_image_storage_path: z.string().nullable(),
  size_table_image_url: z.string().nullable(),
  size_table_storage_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by_email_snapshot: z.string(),
  last_update_by_email_snapshot: z.string(),
  brand: relationSchema.nullable(),
  category: relationSchema.extend({ department: relationSchema.nullable() }).nullable(),
  collection: relationSchema.nullable(),
  variants: z.array(variantSchema),
});

const VARIANT_COLUMNS =
  "id,size,color_hash,color_name,barcode,stock,is_active,is_printed,preorder_enabled,maximum_preorder_quantity,image_url,image_storage_path,created_at,updated_at,cart_items(count)";

const DETAIL_COLUMNS = [
  "id,name,description,price,discount,label,label_color,label_bg,is_active,display_order",
  "cover_image_url,cover_image_storage_path,size_table_image_url,size_table_storage_path",
  "created_at,updated_at,created_by_email_snapshot,last_update_by_email_snapshot",
  "brand:brands(id,name,is_active)",
  "category:categories(id,name,is_active,department:departments(id,name,is_active))",
  "collection:collections(id,name,is_active)",
  `variants(${VARIANT_COLUMNS})`,
].join(",");

function lockReason(isPrinted: boolean, inCart: boolean): VariantLockReason {
  if (isPrinted && inCart) return "printed_and_in_cart";
  if (isPrinted) return "printed";
  if (inCart) return "in_cart";
  return null;
}

function toVariant(row: z.infer<typeof variantSchema>): ProductVariant {
  const cartLineCount = row.cart_items?.[0]?.count ?? 0;
  return {
    id: row.id,
    size: row.size,
    colorHash: row.color_hash,
    colorName: row.color_name,
    barcode: row.barcode,
    stock: row.stock,
    isActive: row.is_active,
    isPrinted: row.is_printed,
    preorderEnabled: row.preorder_enabled,
    maximumPreorderQuantity: row.maximum_preorder_quantity,
    imageUrl: row.image_url,
    imageStoragePath: row.image_storage_path,
    cartLineCount,
    lockReason: lockReason(row.is_printed, cartLineCount > 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Place in the manual order (`display_order ASC NULLS LAST, id ASC`) via
 * head-only COUNT queries — no rows are transferred. `null` if unavailable.
 */
async function manualPosition(
  supabase: ServerSupabase,
  id: string,
  displayOrder: number | null,
): Promise<{ rank: number; total: number } | null> {
  // `id` is a validated uuid and displayOrder an integer from the database.
  const before =
    displayOrder === null
      ? // Every ordered row comes first, then unordered rows by id.
        `display_order.not.is.null,and(display_order.is.null,id.lt.${id})`
      : `display_order.lt.${displayOrder},and(display_order.eq.${displayOrder},id.lt.${id})`;

  const [total, ahead] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).or(before),
  ]);
  if (total.error || ahead.error || total.count === null || ahead.count === null) return null;
  return { rank: ahead.count + 1, total: total.count };
}

/**
 * Product + relations + variants (with visible cart-line counts) in a single
 * request. `null` when the product doesn't exist (or RLS hides it).
 */
export async function getProductDetail(supabase: ServerSupabase, id: string): Promise<ProductDetail | null> {
  const { data, error, status } = await supabase
    .from("products")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .order("created_at", { referencedTable: "variants", ascending: true })
    .order("id", { referencedTable: "variants", ascending: true })
    .maybeSingle();

  if (error) throw fromPostgresCode(error.code, status);
  if (!data) return null;

  const parsed = detailSchema.safeParse(data);
  if (!parsed.success) {
    throw new EntityRequestError("server_error", "The server returned data in an unexpected format.", 500);
  }
  const row = parsed.data;
  const position = await manualPosition(supabase, row.id, row.display_order);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    discount: row.discount,
    label: row.label,
    labelColor: row.label_color,
    labelBg: row.label_bg,
    isActive: row.is_active,
    displayOrder: row.display_order,
    position,
    brand: toRelationRef(row.brand),
    category: toRelationRef(row.category),
    department: toRelationRef(row.category?.department),
    collection: toRelationRef(row.collection),
    coverImageUrl: row.cover_image_url,
    coverImageStoragePath: row.cover_image_storage_path,
    sizeTableImageUrl: row.size_table_image_url,
    sizeTableStoragePath: row.size_table_storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByEmail: row.created_by_email_snapshot,
    lastUpdatedByEmail: row.last_update_by_email_snapshot,
    variants: row.variants.map(toVariant),
  };
}

/** Upper bound per option list; the store has a handful of each. */
const OPTIONS_LIMIT = 1000;

const optionSchema = z.object({ id: z.string(), name: z.string(), is_active: z.boolean() });
const categoryOptionSchema = optionSchema.extend({ department_id: z.string().nullable() });

function toOption(row: z.infer<typeof optionSchema>): RelationOption {
  return { id: row.id, name: row.name, isActive: row.is_active };
}

/**
 * Every brand / category / collection / department (id, name, visibility) for
 * the product form selectors and listing filters, in their manual order —
 * five small queries in parallel, one HTTP round trip for the client.
 */
export async function listProductOptions(supabase: ServerSupabase): Promise<ProductOptions> {
  const ordered = <T extends string>(table: T, columns: string) =>
    supabase
      .from(table)
      .select(columns)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .limit(OPTIONS_LIMIT);

  const [brands, categories, collections, departments, settings] = await Promise.all([
    ordered("brands", "id,name,is_active"),
    ordered("categories", "id,name,is_active,department_id"),
    ordered("collections", "id,name,is_active"),
    ordered("departments", "id,name,is_active"),
    supabase.from("store_settings").select("disable_pre_order").maybeSingle<{ disable_pre_order: boolean }>(),
  ]);

  for (const result of [brands, categories, collections, departments, settings]) {
    if (result.error) throw fromPostgresCode(result.error.code, result.status);
  }

  const parse = <S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S>[] => {
    const parsed = z.array(schema).safeParse(value ?? []);
    if (!parsed.success) throw new EntityRequestError("server_error", "The server returned data in an unexpected format.", 500);
    return parsed.data;
  };

  return {
    brands: parse(optionSchema, brands.data).map(toOption),
    categories: parse(categoryOptionSchema, categories.data).map(
      (row): CategoryOption => ({ ...toOption(row), departmentId: row.department_id }),
    ),
    collections: parse(optionSchema, collections.data).map(toOption),
    departments: parse(optionSchema, departments.data).map(toOption),
    preOrdersDisabled: settings.data?.disable_pre_order === true,
  };
}
