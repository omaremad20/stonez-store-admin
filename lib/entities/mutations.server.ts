import "server-only";

import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";
import { EntityRequestError, fromPostgresCode } from "@/lib/entities/errors";
import {
  ENTITY_FORM_RULES,
  type EntityFormField,
  type EntityRecord,
  type FieldErrors,
  type ImageAction,
} from "@/lib/entities/form-schema";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type RawRecord = {
  id: string;
  name: string;
  slug?: string | null;
  description: string | null;
  is_active: boolean;
  department_id?: string | null;
  image_url: string | null;
  storage_path: string | null;
  updated_at: string;
};

function recordColumns(entity: EntityKey) {
  const rules = ENTITY_FORM_RULES[entity];
  const columns = ["id", "name", "description", "is_active", "image_url", "storage_path", "updated_at"];
  if (rules.hasSlug) columns.push("slug");
  if (rules.hasDepartment) columns.push("department_id");
  return columns.join(",");
}

function toRecord(row: RawRecord): EntityRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    description: row.description,
    isActive: row.is_active,
    departmentId: row.department_id ?? null,
    imageUrl: row.image_url,
    storagePath: row.storage_path,
    updatedAt: row.updated_at,
  };
}

/* ---------------------------------------------------------- error map */

type PgError = { code?: string; message?: string; details?: string | null };

/**
 * Translates a write failure into a safe, field-aware error. Constraint names
 * come from the live schema; raw database text never reaches the client.
 */
export function mapWriteError(entity: EntityKey, error: PgError, attemptedName?: string): EntityRequestError {
  const singular = ENTITY_CONFIG[entity].singular.toLowerCase();
  const constraint = /constraint "([^"]+)"/.exec(error.message ?? "")?.[1] ?? "";
  const field = (key: EntityFormField, message: string) =>
    new EntityRequestError("validation", message, 422, { [key]: message } as FieldErrors);

  switch (error.code) {
    case "23505": {
      if (/name/.test(constraint)) {
        return new EntityRequestError(
          "conflict",
          `A ${singular} with this name already exists.`,
          409,
          { name: attemptedName ? `“${attemptedName.trim()}” is already used by another ${singular}.` : `This name is already used by another ${singular}.` },
        );
      }
      if (/slug/.test(constraint) || /unique slug/i.test(error.message ?? "")) {
        return field("name", `A ${singular} with a very similar name was saved at the same moment. Try again or adjust the name.`);
      }
      return new EntityRequestError("conflict", "This change conflicts with another record. Please try again.", 409);
    }
    case "23514": {
      if (/name/.test(constraint)) return field("name", "This name doesn't meet the length requirements.");
      if (/description/.test(constraint)) return field("description", "This description doesn't meet the length requirements.");
      if (/image|storage/.test(constraint) || /reason=/.test(error.details ?? "")) {
        return field("image", "The image couldn't be attached. Remove it and upload it again.");
      }
      return new EntityRequestError("validation", "Some values were rejected by the database. Check the form and try again.", 422);
    }
    case "22023":
      // Raised by the slug generator: the name has fewer than 2 letters/digits.
      return field("name", "Include at least 2 letters or numbers in the name.");
    case "23503":
      return field("departmentId", "That department no longer exists. Choose another one.");
    case "23502":
      return new EntityRequestError("validation", "A required value is missing. Check the form and try again.", 422);
    case "PGRST301":
    case "PGRST302":
      return new EntityRequestError("unauthenticated", "Your session has expired. Sign in again to continue.", 401);
    default:
      return fromPostgresCode(error.code, 500);
  }
}

/* -------------------------------------------------------------- reads */

export async function getEntityRecord(supabase: ServerSupabase, entity: EntityKey, id: string): Promise<EntityRecord | null> {
  const { data, error } = await supabase.from(entity).select(recordColumns(entity)).eq("id", id).maybeSingle<RawRecord>();
  if (error) throw fromPostgresCode(error.code, 500);
  return data ? toRecord(data) : null;
}

/**
 * Case-insensitive name lookup for tables with a unique name index. Used for
 * the inline availability hint and to verify an uncertain create.
 */
export async function findByName(
  supabase: ServerSupabase,
  entity: EntityKey,
  name: string,
  excludeId?: string | null,
): Promise<{ id: string; name: string } | null> {
  const escaped = name.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  let query = supabase.from(entity).select("id,name").ilike("name", escaped).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw fromPostgresCode(error.code, 500);
  return (data?.[0] as { id: string; name: string } | undefined) ?? null;
}

/* ------------------------------------------------------------- writes */

type WriteInput = {
  name: string;
  description: string | null;
  isActive: boolean;
  departmentId?: string | null;
  image: ImageAction;
};

function imageColumns(supabase: ServerSupabase, entity: EntityKey, image: ImageAction) {
  if (image.action === "keep") return {};
  if (image.action === "remove") return { image_url: null, storage_path: null };
  const bucket = ENTITY_FORM_RULES[entity].bucket;
  // Built server-side from the validated object key, so the URL and path always
  // describe the same object (enforced again by validate_image_reference).
  const { publicUrl } = supabase.storage.from(bucket).getPublicUrl(image.path).data;
  return { image_url: publicUrl, storage_path: image.path };
}

export async function createEntity(
  supabase: ServerSupabase,
  entity: EntityKey,
  input: WriteInput & { clientId?: string },
): Promise<EntityRecord> {
  const rules = ENTITY_FORM_RULES[entity];
  const row: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    is_active: input.isActive,
    ...imageColumns(supabase, entity, input.image),
  };
  if (rules.hasDepartment) row.department_id = input.departmentId ?? null;
  // departments_lock_system_fields always assigns its own id.
  if (input.clientId && entity !== "departments") row.id = input.clientId;

  const { data, error } = await supabase.from(entity).insert(row).select(recordColumns(entity)).single<RawRecord>();
  if (error) throw mapWriteError(entity, error, input.name);
  return toRecord(data);
}

export type UpdateResult = { record: EntityRecord; imageCleanupFailed: boolean };

export async function updateEntity(
  supabase: ServerSupabase,
  entity: EntityKey,
  id: string,
  input: WriteInput & { expectedUpdatedAt: string; force?: boolean },
): Promise<UpdateResult> {
  const rules = ENTITY_FORM_RULES[entity];
  const current = await getEntityRecord(supabase, entity, id);
  if (!current) {
    throw new EntityRequestError("not_found", `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} no longer exists. It may have been deleted.`, 404);
  }
  if (!input.force && current.updatedAt !== input.expectedUpdatedAt) {
    throw new EntityRequestError("stale", `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} was changed by someone else after you opened it.`, 409);
  }

  const patch: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    is_active: input.isActive,
    ...imageColumns(supabase, entity, input.image),
  };
  if (rules.hasDepartment) {
    const nextDepartment = input.departmentId ?? null;
    patch.department_id = nextDepartment;
    // Order is unique per department: keeping the old position could collide in
    // the new department, so a moved category goes to the end of its new list.
    if (nextDepartment !== current.departmentId) patch.display_order = null;
  }

  let query = supabase.from(entity).update(patch).eq("id", id);
  // Race-safe: the write only applies if nobody changed the row in between.
  if (!input.force) query = query.eq("updated_at", current.updatedAt);
  const { data, error } = await query.select(recordColumns(entity));
  if (error) throw mapWriteError(entity, error, input.name);

  if (!data || data.length === 0) {
    const stillThere = await getEntityRecord(supabase, entity, id);
    if (!stillThere) {
      throw new EntityRequestError("not_found", `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} no longer exists. It may have been deleted.`, 404);
    }
    throw new EntityRequestError("stale", `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} was changed by someone else after you opened it.`, 409);
  }

  const record = toRecord(data[0] as unknown as RawRecord);
  let imageCleanupFailed = false;
  const oldPath = current.storagePath;
  if (input.image.action !== "keep" && oldPath && oldPath !== record.storagePath) {
    imageCleanupFailed = !(await removeUnreferencedImage(supabase, entity, oldPath));
  }
  return { record, imageCleanupFailed };
}

/**
 * Removes a replaced image, unless another row still points at it — the same
 * shared-image guard the delete Edge Functions use. Best effort: an orphaned
 * file is harmless, a missing one is not.
 */
async function removeUnreferencedImage(supabase: ServerSupabase, entity: EntityKey, path: string): Promise<boolean> {
  const { count, error } = await supabase.from(entity).select("id", { count: "exact", head: true }).eq("storage_path", path);
  if (error) return false;
  if ((count ?? 0) > 0) return true;
  const { error: removeError } = await supabase.storage.from(ENTITY_FORM_RULES[entity].bucket).remove([path]);
  return !removeError;
}
