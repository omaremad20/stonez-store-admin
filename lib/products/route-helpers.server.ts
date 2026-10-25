import "server-only";

import { NextResponse } from "next/server";

import { ENTITY_ERROR_MESSAGES, EntityRequestError } from "@/lib/entities/errors";
import { NO_STORE } from "@/lib/entities/route-helpers.server";
import type { EntityApiErrorCode } from "@/lib/entities/types";
import { ProductRequestError, type ProductApiErrorBody } from "@/lib/products/errors";
import type { ProductFieldErrors } from "@/lib/products/types";

export function productErrorResponse(
  code: EntityApiErrorCode,
  status: number,
  message: string = ENTITY_ERROR_MESSAGES[code],
  fieldErrors?: ProductFieldErrors,
) {
  return NextResponse.json<ProductApiErrorBody>(
    { error: { code, message, ...(fieldErrors && Object.keys(fieldErrors).length ? { fieldErrors } : {}) } },
    { status, headers: NO_STORE },
  );
}

export function toProductErrorResponse(error: unknown) {
  if (error instanceof ProductRequestError) {
    return productErrorResponse(error.code, error.status || 500, error.message, error.productFieldErrors);
  }
  if (error instanceof EntityRequestError) {
    return productErrorResponse(error.code, error.status || 500, error.message);
  }
  console.error("[products] unexpected error", error);
  return productErrorResponse("server_error", 500);
}
