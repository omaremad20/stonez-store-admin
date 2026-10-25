import type { EntityKey } from "@/lib/entities/config";

/**
 * Normalised listing row. The server adapter maps each table's columns into
 * this shape, so shared UI never needs entity-specific conditionals.
 */
export type EntityListItem = {
  id: string;
  name: string;
  /** `null` for entities without a slug column (categories). */
  slug: string | null;
  isActive: boolean;
  displayOrder: number | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only for categories. */
  department?: { id: string; name: string } | null;
};

export type EntityListPage = {
  items: EntityListItem[];
  /** Opaque keyset cursor for the next chunk, `null` at the end of the list. */
  nextCursor: string | null;
};

export type EntityApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "server_error"
  | "network";

export type EntityApiErrorBody = {
  error: { code: EntityApiErrorCode; message: string };
};

export type ReorderPosition = "before" | "after" | "first" | "last";

export type ReorderInput = {
  entity: EntityKey;
  id: string;
  targetId: string | null;
  position: ReorderPosition;
};
