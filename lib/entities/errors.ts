import type { EntityApiErrorBody, EntityApiErrorCode } from "@/lib/entities/types";

/** Error carried through TanStack Query; `message` is always safe to show. */
export class EntityRequestError extends Error {
  readonly code: EntityApiErrorCode;
  readonly status: number;
  readonly fieldErrors: EntityApiErrorBody["error"]["fieldErrors"];

  constructor(
    code: EntityApiErrorCode,
    message: string,
    status = 0,
    fieldErrors?: EntityApiErrorBody["error"]["fieldErrors"],
  ) {
    super(message);
    this.name = "EntityRequestError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** 4xx-style failures will not succeed on retry. */
  get isPermanent(): boolean {
    return this.code !== "server_error" && this.code !== "network" && this.code !== "timeout";
  }

  /** The request may have reached the database: its outcome is unknown. */
  get isUncertain(): boolean {
    return this.code === "timeout" || this.code === "network";
  }
}

export const ENTITY_ERROR_MESSAGES: Record<EntityApiErrorCode, string> = {
  unauthenticated: "Your session has expired. Sign in again to continue.",
  forbidden: "Only administrators can manage this section.",
  bad_request: "That request wasn't valid. Reset the filters and try again.",
  not_found: "This record no longer exists. It may have been deleted by someone else.",
  conflict: "Someone else changed this list at the same time. Please try again.",
  server_error: "Something went wrong on our side. Please try again.",
  network: "We couldn't reach the server. Check your connection and try again.",
  validation: "Some values need attention. Check the highlighted fields.",
  stale: "This record was changed by someone else after you opened it.",
  timeout: "The server took too long to respond. Your changes may or may not have been saved.",
};

export function toEntityError(error: unknown): EntityRequestError {
  if (error instanceof EntityRequestError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new EntityRequestError("network", "The request was cancelled.");
  }
  if (error instanceof TypeError) {
    return new EntityRequestError("network", ENTITY_ERROR_MESSAGES.network);
  }
  return new EntityRequestError("server_error", ENTITY_ERROR_MESSAGES.server_error);
}

/** Maps a Postgres / PostgREST error code to a safe, user-facing error. */
export function fromPostgresCode(code: string | undefined, status = 0): EntityRequestError {
  switch (code) {
    case "42501":
      return new EntityRequestError("forbidden", ENTITY_ERROR_MESSAGES.forbidden, 403);
    case "P0002":
    case "PGRST116":
      return new EntityRequestError("not_found", ENTITY_ERROR_MESSAGES.not_found, 404);
    case "40001":
    case "40P01":
    case "23505":
      return new EntityRequestError("conflict", ENTITY_ERROR_MESSAGES.conflict, 409);
    case "22023":
    case "22P02":
    case "PGRST100":
      return new EntityRequestError("bad_request", ENTITY_ERROR_MESSAGES.bad_request, 400);
    default:
      return new EntityRequestError("server_error", ENTITY_ERROR_MESSAGES.server_error, status || 500);
  }
}
