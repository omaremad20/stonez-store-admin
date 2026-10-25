/**
 * Single source of truth for the four catalog entities that share the
 * listing UI (departments, brands, categories, collections).
 *
 * Only genuine schema differences live here — verified against the
 * Supabase schema:
 *   - `categories` has no `slug` column.
 *   - `categories.department_id` → `departments.id` (ON DELETE SET NULL), and
 *     categories are ordered per department (UNIQUE (department_id, display_order)).
 *   - products reference brands / categories / collections (ON DELETE SET NULL).
 */

export const ENTITY_KEYS = ["departments", "brands", "categories", "collections"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export function isEntityKey(value: string): value is EntityKey {
  return (ENTITY_KEYS as readonly string[]).includes(value);
}

export type EntityColumnId = "name" | "department" | "status" | "updated_at";

/** Rows in another table whose foreign key is set to NULL when this entity is deleted. */
export type EntityDependent = {
  table: "products" | "categories";
  column: "brand_id" | "category_id" | "collection_id" | "department_id";
  singular: string;
  plural: string;
};

export type EntityConfig = {
  key: EntityKey;
  singular: string;
  plural: string;
  /** Listing route. Detail: `${href}/[id]`, edit: `${href}/[id]/edit`, create: `${href}/new`. */
  href: string;
  description: string;
  hasSlug: boolean;
  /** Supported by `categories` only: filter + ordering scope by department. */
  departmentScope: boolean;
  columns: readonly EntityColumnId[];
  /** Existing Edge Function that deletes the row and then its storage image. */
  deleteFunction: { name: string; idField: string };
  dependents: readonly EntityDependent[];
  /** Extra sentence for the visibility dialog when related data is unaffected. */
  visibilityNote?: string;
};

export const ENTITY_CONFIG: Record<EntityKey, EntityConfig> = {
  departments: {
    key: "departments",
    singular: "Department",
    plural: "Departments",
    href: "/departments",
    description: "Top-level sections of the store, such as men's, women's and kids' wear. Categories are grouped under them.",
    hasSlug: true,
    departmentScope: false,
    columns: ["name", "status", "updated_at"],
    deleteFunction: { name: "delete-department", idField: "department_id" },
    dependents: [
      { table: "categories", column: "department_id", singular: "category", plural: "categories" },
    ],
    visibilityNote: "Categories in this department keep their own visibility settings.",
  },
  brands: {
    key: "brands",
    singular: "Brand",
    plural: "Brands",
    href: "/brands",
    description: "Labels carried by Stonez Store. Brands appear on product pages and in storefront filters.",
    hasSlug: true,
    departmentScope: false,
    columns: ["name", "status", "updated_at"],
    deleteFunction: { name: "delete-brand", idField: "brand_id" },
    dependents: [{ table: "products", column: "brand_id", singular: "product", plural: "products" }],
    visibilityNote: "Products from this brand keep their own visibility settings.",
  },
  categories: {
    key: "categories",
    singular: "Category",
    plural: "Categories",
    href: "/categories",
    description: "Product types within each department. Order is managed separately for every department.",
    hasSlug: false,
    departmentScope: true,
    columns: ["name", "department", "status", "updated_at"],
    deleteFunction: { name: "delete-category", idField: "category_id" },
    dependents: [{ table: "products", column: "category_id", singular: "product", plural: "products" }],
    visibilityNote: "Products in this category keep their own visibility settings.",
  },
  collections: {
    key: "collections",
    singular: "Collection",
    plural: "Collections",
    href: "/collections",
    description: "Curated and seasonal groupings of products, such as new drops or campaigns.",
    hasSlug: true,
    departmentScope: false,
    columns: ["name", "status", "updated_at"],
    deleteFunction: { name: "delete-collection", idField: "collection_id" },
    dependents: [{ table: "products", column: "collection_id", singular: "product", plural: "products" }],
    visibilityNote: "Products in this collection keep their own visibility settings.",
  },
};

export function entityRoutes(config: EntityConfig) {
  return {
    list: config.href,
    create: `${config.href}/new`,
    detail: (id: string) => `${config.href}/${id}`,
    edit: (id: string) => `${config.href}/${id}/edit`,
  };
}

/**
 * Validates a `?from=` return URL: only this entity's own listing path (with
 * its query state) is accepted, so the param can't redirect anywhere else.
 */
export function safeListUrl(config: EntityConfig, raw: string | string[] | undefined | null): string {
  if (typeof raw !== "string" || raw.length > 512) return config.href;
  try {
    const url = new URL(raw, "http://stonez.local");
    if (url.origin !== "http://stonez.local" || url.pathname !== config.href) return config.href;
    return `${url.pathname}${url.search}`;
  } catch {
    return config.href;
  }
}
