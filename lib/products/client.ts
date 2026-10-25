"use client";

import { ENTITY_ERROR_MESSAGES, EntityRequestError, fromPostgresCode, toEntityError } from "@/lib/entities/errors";
import { WRITE_TIMEOUT_MS } from "@/lib/entities/form-client";
import type { ReorderPosition } from "@/lib/entities/types";
import { ProductRequestError, type ProductApiErrorBody } from "@/lib/products/errors";
import type { ProductSavePayload } from "@/lib/products/form-schema";
import { serializeProductQueryState, type ProductQueryState } from "@/lib/products/query-state";
import type { ProductDetail, ProductListPage, ProductOptions } from "@/lib/products/types";
import { createClient } from "@/lib/supabase/client";

/* ---------------------------------------------------------------- fetch */

/**
 * fetch + JSON with an explicit timeout. A timeout or dropped connection is
 * reported as `timeout` / `network` (outcome unknown) — never as a rejection.
 */
async function requestJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; externalSignal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs ?? WRITE_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  init.externalSignal?.addEventListener("abort", onExternalAbort);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (error) {
    if (init.externalSignal?.aborted) throw new EntityRequestError("network", "The request was cancelled.");
    if (controller.signal.aborted) throw new EntityRequestError("timeout", ENTITY_ERROR_MESSAGES.timeout);
    throw toEntityError(error);
  } finally {
    window.clearTimeout(timer);
    init.externalSignal?.removeEventListener("abort", onExternalAbort);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (proxy error page, gateway timeout…).
  }

  if (!response.ok) {
    const error = (body as Partial<ProductApiErrorBody> | null)?.error;
    // 502/503/504 from an intermediary: a write may still have committed.
    if (!error && [502, 503, 504].includes(response.status)) {
      throw new EntityRequestError("timeout", ENTITY_ERROR_MESSAGES.timeout, response.status);
    }
    const code = error?.code ?? (response.status >= 500 ? "server_error" : "bad_request");
    throw new ProductRequestError(code, error?.message ?? ENTITY_ERROR_MESSAGES[code], response.status, error?.fieldErrors);
  }
  return body as T;
}

/* --------------------------------------------------------------- reads */

export function fetchProductsPage(state: ProductQueryState, cursor: string | null, signal?: AbortSignal) {
  const params = serializeProductQueryState(state);
  if (cursor) params.set("cursor", cursor);
  return requestJson<ProductListPage>(`/api/products?${params.toString()}`, { timeoutMs: 20_000, externalSignal: signal });
}

export async function fetchProduct(id: string, signal?: AbortSignal): Promise<ProductDetail> {
  const { product } = await requestJson<{ product: ProductDetail }>(`/api/products/${id}`, { timeoutMs: 15_000, externalSignal: signal });
  return product;
}

export function fetchProductOptions(signal?: AbortSignal) {
  return requestJson<ProductOptions>("/api/products/options", { timeoutMs: 15_000, externalSignal: signal });
}

/* -------------------------------------------------------------- writes */

export type SaveResponse = { id: string; updatedAt: string; imageCleanupFailed: boolean };

export function createProductRequest(payload: ProductSavePayload) {
  return requestJson<SaveResponse>("/api/products", { method: "POST", body: JSON.stringify(payload) });
}

export function updateProductRequest(id: string, payload: ProductSavePayload) {
  return requestJson<SaveResponse>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteProductRequest(id: string) {
  return requestJson<{ imageCleanupFailed: boolean }>(`/api/products/${id}`, { method: "DELETE" });
}

// The writes below run with the signed-in user's session. Authorization is
// enforced by RLS (admin-only UPDATE) and the RPCs' is_admin() checks.

/** Hide / show. RLS filters rows the caller may not update, so "0 rows" = forbidden or gone. */
export async function setProductVisibility(id: string, isActive: boolean) {
  const { data, error, status } = await createClient()
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id,is_active,updated_at");
  if (error) throw fromPostgresCode(error.code, status);
  if (!data || data.length === 0) {
    throw new EntityRequestError("not_found", "This product no longer exists or you don't have permission to change it.", 404);
  }
  const row = data[0] as { is_active: boolean; updated_at: string };
  return { isActive: row.is_active, updatedAt: row.updated_at };
}

/** Shared sparse-gap, advisory-locked `reorder_catalog_entity` RPC (products scope = whole table). */
export async function reorderProduct(input: { id: string; targetId: string | null; position: ReorderPosition }) {
  const { error, status } = await createClient().rpc("reorder_catalog_entity", {
    p_entity: "products",
    p_id: input.id,
    p_target_id: input.targetId,
    p_position: input.position,
  });
  if (error) throw fromPostgresCode(error.code, status);
}

/**
 * Locks the variant's barcode, size and colour permanently (existing RPC).
 * Only called after the admin confirms the label actually printed.
 */
export async function markVariantPrinted(variantId: string): Promise<{ isPrinted: boolean; updatedAt: string }> {
  const { data, error, status } = await createClient().rpc("mark_variant_as_printed", { p_variant_id: variantId });
  if (error) {
    if (error.code === "22023") throw new EntityRequestError("not_found", "This variant no longer exists.", 404);
    throw fromPostgresCode(error.code, status);
  }
  const row = data as { is_printed: boolean; updated_at: string } | null;
  return { isPrinted: row?.is_printed === true, updatedAt: row?.updated_at ?? "" };
}
