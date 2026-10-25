import "server-only";

import { EntityRequestError, fromPostgresCode } from "@/lib/entities/errors";
import { PRODUCT_BUCKETS, type ProductBucket } from "@/lib/products/constants";
import { ProductRequestError } from "@/lib/products/errors";
import { MESSAGES, type ImageAction, type ParsedProductSavePayload } from "@/lib/products/form-schema";
import type { ProductFieldErrors } from "@/lib/products/types";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/* ------------------------------------------------------------ error map */

const PRODUCT_CHECK_FIELDS: Record<string, { field: string; message: string }> = {
  products_name_length_check: { field: "name", message: MESSAGES.name },
  products_description_length_check: { field: "description", message: MESSAGES.description },
  products_price_range_check: { field: "price", message: MESSAGES.price },
  products_discount_range_check: { field: "discount", message: MESSAGES.discount },
  products_label_length_check: { field: "label", message: MESSAGES.label },
  products_label_color_format_check: { field: "labelColor", message: MESSAGES.hex },
  products_label_bg_format_check: { field: "labelBg", message: MESSAGES.hex },
};

const PRODUCT_FK_FIELDS: Record<string, { field: string; message: string }> = {
  products_brand_id_fkey: { field: "brandId", message: "That brand no longer exists. Choose another one." },
  products_category_id_fkey: { field: "categoryId", message: "That category no longer exists. Choose another one." },
  products_collection_id_fkey: { field: "collectionId", message: "That collection no longer exists. Choose another one." },
};

const VARIANT_CHECK_FIELDS: Record<string, { field: string; message: string }> = {
  variants_size_length_check: { field: "size", message: MESSAGES.size },
  variants_color_name_length_check: { field: "colorName", message: MESSAGES.colorName },
  variants_color_hash_format_check: { field: "colorHash", message: MESSAGES.hex },
  variants_maximum_preorder_quantity_check: { field: "maximumPreorderQuantity", message: MESSAGES.maxPreorder },
};

function lockText(detail: string) {
  const reason = /lock_reason=(\w+)/.exec(detail)?.[1];
  if (reason === "printed") return "its label has been printed";
  if (reason === "in_cart") return "it's in a customer's cart";
  if (reason === "printed_and_in_cart") return "its label has been printed and it's in a customer's cart";
  return "it's locked";
}

function invalid(fieldErrors: ProductFieldErrors, message = "Some values need attention. Check the highlighted fields.") {
  return new ProductRequestError("validation", message, 422, fieldErrors);
}

/**
 * Translates an RPC failure into a safe, field-aware error. Constraint names
 * and the `variant_ref=…` detail prefix come from the live schema / the
 * save_product_with_variants RPC; raw database text never reaches the client.
 */
export function mapSaveError(error: PgError): EntityRequestError {
  const detail = error.details ?? "";
  const message = error.message ?? "";

  const variant = /^variant_ref=([^;]*);op=(\w+);constraint=([^;]*);([\s\S]*)$/.exec(detail);
  if (variant) {
    const [, ref, op, constraint, rest] = variant;
    const row = `variants.${ref}`;
    switch (error.code) {
      case "23505":
        return invalid({ [`${row}.size`]: MESSAGES.duplicateVariant });
      case "23514": {
        const mapped = VARIANT_CHECK_FIELDS[constraint];
        if (mapped) return invalid({ [`${row}.${mapped.field}`]: mapped.message });
        if (/reason=/.test(rest)) return invalid({ [`${row}.image`]: "This image couldn't be attached. Remove it and upload it again." });
        return invalid({ [row]: "Some values of this variant were rejected by the database." });
      }
      case "22023":
        if (/lock_reason=/.test(rest)) {
          return invalid({
            [`${row}.size`]: `Size and colour can't change because ${lockText(rest)}. Hide this variant and add a new one instead.`,
          });
        }
        return invalid({ [row]: "This variant change wasn't accepted." });
      case "23001":
        return new ProductRequestError(
          "conflict",
          "A variant you removed can't be deleted.",
          409,
          { [row]: `Can't be deleted because ${lockText(rest)}. Restore it and hide it instead.` },
        );
      case "P0002":
        return new ProductRequestError("stale", "A variant was deleted by someone else. Reload the product.", 409, {
          [row]: "This variant no longer exists.",
        });
      case "22003":
      case "22P02":
      case "23502":
        return invalid({ [row]: "A value of this variant is missing or out of range." });
      case "42501":
        return new EntityRequestError("forbidden", "Only administrators can manage products.", 403);
      default:
        return op === "delete"
          ? new ProductRequestError("server_error", "A removed variant couldn't be deleted.", 500, { [row]: "Couldn't be deleted." })
          : fromPostgresCode(error.code, 500);
    }
  }

  const constraint = /constraint "([^"]+)"/.exec(message)?.[1] ?? "";
  switch (error.code) {
    case "42501":
      return new EntityRequestError("forbidden", "Only administrators can manage products.", 403);
    case "40001":
      if (/reason=stale_product/.test(detail)) {
        return new EntityRequestError("stale", "This product was changed by someone else after you opened it.", 409);
      }
      return new EntityRequestError("conflict", "Someone else saved at the same time. Please try again.", 409);
    case "P0002":
      return new EntityRequestError("not_found", "This product no longer exists. It may have been deleted.", 404);
    case "23505":
      if (constraint === "products_pkey") {
        return new EntityRequestError("conflict", "This product has already been created. Open the products list to find it.", 409);
      }
      return new EntityRequestError("conflict", "This change conflicts with another record. Please try again.", 409);
    case "23514": {
      const mapped = PRODUCT_CHECK_FIELDS[constraint];
      if (mapped) return invalid({ [mapped.field]: mapped.message });
      if (/reason=/.test(detail)) {
        const field = message.includes(PRODUCT_BUCKETS.sizeTable) ? "sizeTableImage" : message.includes(PRODUCT_BUCKETS.cover) ? "coverImage" : null;
        const text = "This image couldn't be attached. Remove it and upload it again.";
        return field ? invalid({ [field]: text }) : invalid({}, text);
      }
      return invalid({}, "Some values were rejected by the database. Check the form and try again.");
    }
    case "23503": {
      const mapped = PRODUCT_FK_FIELDS[constraint];
      return mapped ? invalid({ [mapped.field]: mapped.message }) : invalid({}, "A linked record no longer exists. Check the selections.");
    }
    case "22023":
      return new EntityRequestError("bad_request", "The save request wasn't valid. Reload the page and try again.", 400);
    case "22003":
    case "22P02":
    case "23502":
      return invalid({}, "A required value is missing or out of range. Check the form and try again.");
    case "PGRST301":
    case "PGRST302":
      return new EntityRequestError("unauthenticated", "Your session has expired. Sign in again to continue.", 401);
    default:
      return fromPostgresCode(error.code, 500);
  }
}

/* --------------------------------------------------------------- images */

function publicUrl(supabase: ServerSupabase, bucket: ProductBucket, path: string) {
  // Built server-side from the validated object key, so URL and path always
  // describe the same object (re-checked by validate_image_reference).
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** RPC image columns for an action: absent keys = keep. */
function imageColumns(
  supabase: ServerSupabase,
  bucket: ProductBucket,
  action: ImageAction | undefined,
  urlKey: string,
  pathKey: string,
): Record<string, string | null> {
  if (!action || action.action === "keep") return {};
  if (action.action === "remove") return { [urlKey]: null, [pathKey]: null };
  return { [urlKey]: publicUrl(supabase, bucket, action.path), [pathKey]: action.path };
}

type ImageRef = { bucket: ProductBucket; path: string };

const REFERENCE_COLUMNS: Record<ProductBucket, { table: "products" | "variants"; column: string }> = {
  [PRODUCT_BUCKETS.cover]: { table: "products", column: "cover_image_storage_path" },
  [PRODUCT_BUCKETS.sizeTable]: { table: "products", column: "size_table_storage_path" },
  [PRODUCT_BUCKETS.variant]: { table: "variants", column: "image_storage_path" },
};

/**
 * Removes images that no row references any more (the same shared-image
 * guard the catalog delete functions use). Best effort: an orphaned file is
 * harmless, a missing one is not. Returns false if anything couldn't be removed.
 */
async function removeUnreferencedImages(supabase: ServerSupabase, images: ImageRef[]): Promise<boolean> {
  let ok = true;
  const unique = [...new Map(images.map((image) => [`${image.bucket}/${image.path}`, image])).values()];
  for (const image of unique) {
    const { table, column } = REFERENCE_COLUMNS[image.bucket];
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, image.path);
    if (error) {
      ok = false;
      continue;
    }
    if ((count ?? 0) > 0) continue;
    const { error: removeError } = await supabase.storage.from(image.bucket).remove([image.path]);
    if (removeError) ok = false;
  }
  return ok;
}

type StoredImages = {
  cover: string | null;
  sizeTable: string | null;
  variants: Map<string, string | null>;
};

async function readStoredImages(supabase: ServerSupabase, id: string): Promise<StoredImages | null> {
  const { data, error, status } = await supabase
    .from("products")
    .select("cover_image_storage_path,size_table_storage_path,variants(id,image_storage_path)")
    .eq("id", id)
    .maybeSingle<{
      cover_image_storage_path: string | null;
      size_table_storage_path: string | null;
      variants: { id: string; image_storage_path: string | null }[];
    }>();
  if (error) throw fromPostgresCode(error.code, status);
  if (!data) return null;
  return {
    cover: data.cover_image_storage_path,
    sizeTable: data.size_table_storage_path,
    variants: new Map(data.variants.map((variant) => [variant.id, variant.image_storage_path])),
  };
}

/* ----------------------------------------------------------------- save */

export type SaveResult = { id: string; updatedAt: string; imageCleanupFailed: boolean };

/**
 * Create or update a product and its variants in ONE transaction via
 * save_product_with_variants (SECURITY INVOKER: RLS, audit, barcode and
 * lock triggers all apply). Replaced / removed images are cleaned up after
 * the commit.
 */
export async function saveProduct(
  supabase: ServerSupabase,
  mode: "create" | "update",
  payload: ParsedProductSavePayload,
): Promise<SaveResult> {
  const before = mode === "update" ? await readStoredImages(supabase, payload.id) : null;
  if (mode === "update" && !before) {
    throw new EntityRequestError("not_found", "This product no longer exists. It may have been deleted.", 404);
  }

  const { product } = payload;
  const productJson = {
    name: product.name,
    description: product.description,
    price: product.price,
    discount: product.discount,
    label: product.label,
    label_color: product.labelColor,
    label_bg: product.labelBg,
    brand_id: product.brandId,
    category_id: product.categoryId,
    collection_id: product.collectionId,
    is_active: product.isActive,
    ...imageColumns(supabase, PRODUCT_BUCKETS.cover, product.coverImage, "cover_image_url", "cover_image_storage_path"),
    ...imageColumns(supabase, PRODUCT_BUCKETS.sizeTable, product.sizeTableImage, "size_table_image_url", "size_table_storage_path"),
  };

  const variantsJson = payload.variants.map((variant) => {
    const image = imageColumns(supabase, PRODUCT_BUCKETS.variant, variant.image, "image_url", "image_storage_path");
    const fields: Record<string, unknown> = { op: variant.op, ref: variant.ref, id: variant.id };
    if (variant.size !== undefined) fields.size = variant.size;
    if (variant.colorHash !== undefined) fields.color_hash = variant.colorHash.toUpperCase();
    if (variant.colorName !== undefined) fields.color_name = variant.colorName;
    if (variant.stock !== undefined) fields.stock = variant.stock;
    if (variant.isActive !== undefined) fields.is_active = variant.isActive;
    if (variant.preorderEnabled !== undefined) fields.preorder_enabled = variant.preorderEnabled;
    if (variant.maximumPreorderQuantity !== undefined) fields.maximum_preorder_quantity = variant.maximumPreorderQuantity;
    return { ...fields, ...image };
  });

  const { data, error } = await supabase.rpc("save_product_with_variants", {
    p_mode: mode,
    p_product_id: payload.id,
    p_product: productJson,
    p_variants: variantsJson,
    p_removed_variant_ids: mode === "update" ? payload.removedVariantIds : [],
    p_expected_updated_at: mode === "update" ? (payload.expectedUpdatedAt ?? null) : null,
    p_force: payload.force === true,
  });
  if (error) throw mapSaveError(error);

  const result = data as { id: string; updated_at: string } | null;
  if (!result?.id) throw new EntityRequestError("server_error", "The server returned data in an unexpected format.", 500);

  // Images this save stopped referencing.
  let imageCleanupFailed = false;
  if (before) {
    const stale: ImageRef[] = [];
    if (product.coverImage.action !== "keep" && before.cover) stale.push({ bucket: PRODUCT_BUCKETS.cover, path: before.cover });
    if (product.sizeTableImage.action !== "keep" && before.sizeTable) stale.push({ bucket: PRODUCT_BUCKETS.sizeTable, path: before.sizeTable });
    for (const variant of payload.variants) {
      const old = before.variants.get(variant.id);
      if (variant.op === "update" && variant.image && variant.image.action !== "keep" && old) {
        stale.push({ bucket: PRODUCT_BUCKETS.variant, path: old });
      }
    }
    for (const id of payload.removedVariantIds) {
      const old = before.variants.get(id);
      if (old) stale.push({ bucket: PRODUCT_BUCKETS.variant, path: old });
    }
    if (stale.length) imageCleanupFailed = !(await removeUnreferencedImages(supabase, stale));
  }

  return { id: result.id, updatedAt: result.updated_at, imageCleanupFailed };
}

/* --------------------------------------------------------------- delete */

export type DeleteResult = { imageCleanupFailed: boolean };

/**
 * Deletes a product; its variants cascade (variants_product_id_fkey ON DELETE
 * CASCADE) and favorites follow. products_protect_deletion rejects the delete
 * while any variant is printed or in a cart — the admin is told to hide it.
 */
export async function deleteProduct(supabase: ServerSupabase, id: string): Promise<DeleteResult> {
  const before = await readStoredImages(supabase, id);
  if (!before) throw new EntityRequestError("not_found", "This product no longer exists. It may have been deleted.", 404);

  const { data, error } = await supabase.from("products").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23001") {
      const printed = Number(/printed_variants=(\d+)/.exec(error.details ?? "")?.[1] ?? 0);
      const inCart = Number(/cart_referenced_variants=(\d+)/.exec(error.details ?? "")?.[1] ?? 0);
      const reasons = [
        printed > 0 ? `${printed} ${printed === 1 ? "variant has" : "variants have"} printed labels` : null,
        inCart > 0 ? `${inCart} ${inCart === 1 ? "variant is" : "variants are"} in customers' carts` : null,
      ].filter(Boolean);
      throw new EntityRequestError(
        "conflict",
        `This product can't be deleted because ${reasons.join(" and ") || "some variants are locked"}. Hide it instead.`,
        409,
      );
    }
    throw fromPostgresCode(error.code, 500);
  }
  if (!data || data.length === 0) {
    throw new EntityRequestError("not_found", "This product no longer exists or you don't have permission to delete it.", 404);
  }

  const images: ImageRef[] = [];
  if (before.cover) images.push({ bucket: PRODUCT_BUCKETS.cover, path: before.cover });
  if (before.sizeTable) images.push({ bucket: PRODUCT_BUCKETS.sizeTable, path: before.sizeTable });
  for (const path of before.variants.values()) if (path) images.push({ bucket: PRODUCT_BUCKETS.variant, path });

  const imageCleanupFailed = images.length ? !(await removeUnreferencedImages(supabase, images)) : false;
  return { imageCleanupFailed };
}
