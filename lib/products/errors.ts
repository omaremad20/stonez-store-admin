import { EntityRequestError } from "@/lib/entities/errors";
import type { EntityApiErrorCode } from "@/lib/entities/types";
import type { ProductFieldErrors } from "@/lib/products/types";

/**
 * Same contract as EntityRequestError (safe `message`, `code`, retry
 * semantics) so the shared dashboard states and toasts work unchanged, plus
 * product form paths for field-level errors (`variants.<ref>.size`, …).
 */
export class ProductRequestError extends EntityRequestError {
  readonly productFieldErrors: ProductFieldErrors | undefined;

  constructor(code: EntityApiErrorCode, message: string, status = 0, fieldErrors?: ProductFieldErrors) {
    super(code, message, status);
    this.name = "ProductRequestError";
    this.productFieldErrors = fieldErrors && Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
  }
}

/** Wire format of every products API error (same envelope as the entity API). */
export type ProductApiErrorBody = {
  error: { code: EntityApiErrorCode; message: string; fieldErrors?: ProductFieldErrors };
};
