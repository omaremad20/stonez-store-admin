import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ENTITY_CONFIG } from "@/lib/entities/config";
import { payloadSchemaFor, toFieldErrors } from "@/lib/entities/form-schema";
import { getEntityRecord, updateEntity } from "@/lib/entities/mutations.server";
import {
  authorizeEntityRequest,
  errorResponse,
  NO_STORE,
  readJson,
  toErrorResponse,
} from "@/lib/entities/route-helpers.server";

const idSchema = z.uuid();

function notFound(entity: keyof typeof ENTITY_CONFIG) {
  return errorResponse("not_found", 404, `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} doesn't exist or was deleted.`);
}

/** GET /api/entities/:entity/:id — editable fields + concurrency token. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/entities/[entity]/[id]">) {
  const { entity: rawEntity, id } = await ctx.params;
  const auth = await authorizeEntityRequest(rawEntity);
  if (!auth.ok) return auth.response;
  if (!idSchema.safeParse(id).success) return notFound(auth.entity);

  try {
    const record = await getEntityRecord(auth.supabase, auth.entity, id);
    if (!record) return notFound(auth.entity);
    return NextResponse.json({ record }, { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/entities/:entity/:id — update with optimistic concurrency. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/entities/[entity]/[id]">) {
  const { entity: rawEntity, id } = await ctx.params;
  const auth = await authorizeEntityRequest(rawEntity);
  if (!auth.ok) return auth.response;
  if (!idSchema.safeParse(id).success) return notFound(auth.entity);

  const parsed = payloadSchemaFor(auth.entity, "update").safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse("validation", 422, undefined, toFieldErrors(parsed.error));
  }
  const body = parsed.data as typeof parsed.data & { expectedUpdatedAt: string; force?: boolean };

  try {
    const result = await updateEntity(auth.supabase, auth.entity, id, {
      ...body,
      departmentId: body.departmentId ?? null,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}
