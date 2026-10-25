import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorizeAdminRequest, NO_STORE, readJson } from "@/lib/entities/route-helpers.server";
import { payloadIssuesToFieldErrors, productSavePayloadSchema } from "@/lib/products/form-schema";
import { getProductDetail } from "@/lib/products/read.server";
import { productErrorResponse, toProductErrorResponse } from "@/lib/products/route-helpers.server";
import { deleteProduct, saveProduct } from "@/lib/products/write.server";

const idSchema = z.uuid();

function notFound() {
  return productErrorResponse("not_found", 404, "This product doesn't exist or was deleted.");
}

/** GET /api/products/:id — product, relations and variants (+ concurrency token). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  const { id } = await ctx.params;
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;
  if (!idSchema.safeParse(id).success) return notFound();

  try {
    const product = await getProductDetail(auth.supabase, id);
    if (!product) return notFound();
    return NextResponse.json({ product }, { headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}

/** PATCH /api/products/:id — atomic update of the product and its variants. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  const { id } = await ctx.params;
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;
  if (!idSchema.safeParse(id).success) return notFound();

  const body = await readJson(request);
  const parsed = productSavePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return productErrorResponse("validation", 422, undefined, payloadIssuesToFieldErrors(parsed.error, body));
  }
  if (parsed.data.id !== id.toLowerCase()) return productErrorResponse("bad_request", 400);
  if (!parsed.data.expectedUpdatedAt && !parsed.data.force) {
    return productErrorResponse("bad_request", 400, "The save request is missing its version. Reload the page and try again.");
  }

  try {
    const result = await saveProduct(auth.supabase, "update", parsed.data);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}

/** DELETE /api/products/:id — variants cascade; locked variants block the delete. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  const { id } = await ctx.params;
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;
  if (!idSchema.safeParse(id).success) return notFound();

  try {
    const result = await deleteProduct(auth.supabase, id);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}
