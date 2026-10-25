import { NextResponse, type NextRequest } from "next/server";

import { authorizeAdminRequest, NO_STORE, readJson } from "@/lib/entities/route-helpers.server";
import { decodeProductCursor } from "@/lib/products/cursor";
import { payloadIssuesToFieldErrors, productSavePayloadSchema } from "@/lib/products/form-schema";
import { listProductsPage } from "@/lib/products/list.server";
import { parseProductQueryState } from "@/lib/products/query-state";
import { productErrorResponse, toProductErrorResponse } from "@/lib/products/route-helpers.server";
import { saveProduct } from "@/lib/products/write.server";

/**
 * GET /api/products?q&status&sort&dir&brand&category&collection&department&cursor
 *
 * Products listing. Exactly 25 rows per request (keyset paging), with brand /
 * category / department / collection and a variant count embedded.
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const state = parseProductQueryState(params);
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeProductCursor(rawCursor, state.sort, state.dir) : null;
  if (rawCursor && !cursor) {
    return productErrorResponse("bad_request", 400, "This list position is no longer valid. Reload the list.");
  }

  try {
    const page = await listProductsPage(auth.supabase, state, cursor);
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}

/**
 * POST /api/products — create a product with its variants in one transaction.
 * The body is re-validated with the shared rules; database constraints,
 * triggers and RLS remain authoritative.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;

  const body = await readJson(request);
  const parsed = productSavePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return productErrorResponse("validation", 422, undefined, payloadIssuesToFieldErrors(parsed.error, body));
  }
  if (parsed.data.removedVariantIds.length > 0 || parsed.data.variants.some((variant) => variant.op !== "insert")) {
    return productErrorResponse("bad_request", 400, "A new product can only contain new variants.");
  }

  try {
    const result = await saveProduct(auth.supabase, "create", parsed.data);
    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}
