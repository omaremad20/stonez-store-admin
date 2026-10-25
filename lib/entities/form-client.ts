"use client";

import { ENTITY_ERROR_MESSAGES, EntityRequestError } from "@/lib/entities/errors";
import {
  ENTITY_FORM_RULES,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  type EntityPayloadInput,
  type EntityRecord,
} from "@/lib/entities/form-schema";
import type { EntityKey } from "@/lib/entities/config";
import type { EntityApiErrorBody } from "@/lib/entities/types";
import { createClient } from "@/lib/supabase/client";

/** Long enough for a slow mobile connection, short enough to keep the user informed. */
export const WRITE_TIMEOUT_MS = 20_000;

/**
 * fetch + JSON with an explicit timeout. A timeout or dropped connection is
 * reported as `timeout` / `network` (outcome unknown) — never as a rejection.
 */
async function requestJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs ?? WRITE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (error) {
    if (controller.signal.aborted) throw new EntityRequestError("timeout", ENTITY_ERROR_MESSAGES.timeout);
    if (error instanceof TypeError) throw new EntityRequestError("network", ENTITY_ERROR_MESSAGES.network);
    throw new EntityRequestError("network", ENTITY_ERROR_MESSAGES.network);
  } finally {
    window.clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (proxy error page, gateway timeout…).
  }

  if (!response.ok) {
    const error = (body as Partial<EntityApiErrorBody> | null)?.error;
    // 502/503/504 from an intermediary: the write may still have committed.
    if (!error && [502, 503, 504].includes(response.status)) {
      throw new EntityRequestError("timeout", ENTITY_ERROR_MESSAGES.timeout, response.status);
    }
    const code = error?.code ?? (response.status >= 500 ? "server_error" : "bad_request");
    throw new EntityRequestError(code, error?.message ?? ENTITY_ERROR_MESSAGES[code], response.status, error?.fieldErrors);
  }
  return body as T;
}

/* --------------------------------------------------------------- reads */

export async function fetchEntityRecord(entity: EntityKey, id: string): Promise<EntityRecord> {
  const { record } = await requestJson<{ record: EntityRecord }>(`/api/entities/${entity}/${id}`, { timeoutMs: 15_000 });
  return record;
}

export async function checkNameAvailable(
  entity: EntityKey,
  name: string,
  excludeId: string | null,
  signal?: AbortSignal,
): Promise<{ available: boolean; existingId: string | null }> {
  const params = new URLSearchParams({ name });
  if (excludeId) params.set("exclude", excludeId);
  const response = await fetch(`/api/entities/${entity}/check-name?${params}`, { signal, cache: "no-store" });
  if (!response.ok) throw new EntityRequestError("server_error", ENTITY_ERROR_MESSAGES.server_error, response.status);
  return response.json();
}

/* -------------------------------------------------------------- writes */

export function createEntityRequest(entity: EntityKey, payload: EntityPayloadInput) {
  return requestJson<{ record: EntityRecord }>(`/api/entities/${entity}`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateEntityRequest(entity: EntityKey, id: string, payload: EntityPayloadInput) {
  return requestJson<{ record: EntityRecord; imageCleanupFailed: boolean }>(`/api/entities/${entity}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/* --------------------------------------------------------------- images */

export class ImagePreparationError extends Error {}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Fits an image inside the bucket limits (1 MiB, png/webp/jpeg). Small WebP
 * files are uploaded untouched; anything else is re-encoded as WebP (JPEG on
 * browsers without a WebP encoder), stepping quality and size down if needed.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; extension: "webp" | "png" | "jpg" }> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new ImagePreparationError("Use a PNG, JPEG or WebP image.");
  }
  if (file.type === "image/webp" && file.size <= IMAGE_MAX_BYTES) return { blob: file, extension: "webp" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePreparationError("This image couldn't be read. Try a different file.");
  }

  const attempts: [maxSide: number, quality: number][] = [
    [2000, 0.86],
    [2000, 0.74],
    [1600, 0.72],
    [1280, 0.7],
    [1024, 0.65],
  ];
  try {
    for (const [maxSide, quality] of attempts) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let blob = await canvasToBlob(canvas, "image/webp", quality);
      let extension: "webp" | "jpg" = "webp";
      if (!blob || blob.type !== "image/webp") {
        blob = await canvasToBlob(canvas, "image/jpeg", quality);
        extension = "jpg";
      }
      if (blob && blob.size <= IMAGE_MAX_BYTES) return { blob, extension };
    }
  } finally {
    bitmap.close();
  }
  throw new ImagePreparationError("This image is too large even after compression. Use a smaller image (under 1 MB).");
}

/** Uploads to the entity's bucket under a fresh, collision-free key. */
export async function uploadEntityImage(entity: EntityKey, file: File): Promise<string> {
  const { blob, extension } = await prepareImage(file);
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await createClient()
    .storage.from(ENTITY_FORM_RULES[entity].bucket)
    .upload(path, blob, { contentType: blob.type || `image/${extension === "jpg" ? "jpeg" : extension}`, upsert: false, cacheControl: "31536000" });
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode ?? 0);
    if (status === 403 || /row-level security|unauthori[sz]ed/i.test(error.message)) {
      throw new EntityRequestError("forbidden", "You don't have permission to upload images.", 403);
    }
    if (status === 413 || /size/i.test(error.message)) {
      throw new ImagePreparationError("The image is larger than the 1 MB limit.");
    }
    throw new EntityRequestError("network", "The image couldn't be uploaded. Check your connection and try again.");
  }
  return path;
}

/** Best effort: removes an upload that ended up unused (failed or cancelled save). */
export async function discardUploadedImage(entity: EntityKey, path: string) {
  try {
    await createClient().storage.from(ENTITY_FORM_RULES[entity].bucket).remove([path]);
  } catch {
    // An orphaned object is harmless; never block the form on cleanup.
  }
}
