/** Shapes exchanged between the products Route Handlers and the dashboard UI. */

export type RelationRef = { id: string; name: string; isActive: boolean };

export type ProductListItem = {
  id: string;
  name: string;
  price: number;
  discount: number;
  isActive: boolean;
  displayOrder: number | null;
  coverImageUrl: string | null;
  label: string | null;
  labelColor: string | null;
  labelBg: string | null;
  brand: RelationRef | null;
  category: RelationRef | null;
  /** From the category (products have no department column). */
  department: RelationRef | null;
  collection: RelationRef | null;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductListPage = {
  items: ProductListItem[];
  /** Opaque keyset cursor for the next batch, `null` at the end of the list. */
  nextCursor: string | null;
};

export type VariantLockReason = "printed" | "in_cart" | "printed_and_in_cart" | null;

export type ProductVariant = {
  id: string;
  size: string;
  colorHash: string;
  colorName: string;
  barcode: string;
  stock: number;
  isActive: boolean;
  isPrinted: boolean;
  preorderEnabled: boolean;
  maximumPreorderQuantity: number;
  imageUrl: string | null;
  imageStoragePath: string | null;
  /**
   * Cart lines referencing this variant that the admin can see (RLS). The
   * database trigger remains the authority on locking.
   */
  cartLineCount: number;
  lockReason: VariantLockReason;
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discount: number;
  label: string | null;
  labelColor: string | null;
  labelBg: string | null;
  isActive: boolean;
  displayOrder: number | null;
  /** 1-based place in the store-wide manual order (same ordering as the listing). */
  position: { rank: number; total: number } | null;
  brand: RelationRef | null;
  category: RelationRef | null;
  department: RelationRef | null;
  collection: RelationRef | null;
  coverImageUrl: string | null;
  coverImageStoragePath: string | null;
  sizeTableImageUrl: string | null;
  sizeTableStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  lastUpdatedByEmail: string;
  variants: ProductVariant[];
};

export type RelationOption = { id: string; name: string; isActive: boolean };
export type CategoryOption = RelationOption & { departmentId: string | null };

export type ProductOptions = {
  brands: RelationOption[];
  categories: CategoryOption[];
  collections: RelationOption[];
  departments: RelationOption[];
  /** store_settings.disable_pre_order (false when the settings row doesn't exist). */
  preOrdersDisabled: boolean;
};

/**
 * Field-level messages, keyed by form path: `name`, `price`, `brandId`,
 * `coverImage`, `variants.<ref>.size`, `variants.<ref>` (row-level) …
 */
export type ProductFieldErrors = Record<string, string>;
