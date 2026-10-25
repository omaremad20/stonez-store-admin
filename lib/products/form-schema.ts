import { z } from "zod";

import { STORAGE_PATH_PATTERN, type ImageValue } from "@/lib/entities/form-schema";
import { HEX_COLOR_PATTERN, PRODUCT_RULES, SAFE_BIGINT, VARIANT_RULES } from "@/lib/products/constants";

/**
 * Product form rules — mirrored from the live schema (see constants.ts).
 * The client form (string inputs) and the server payload (typed JSON) share
 * the same field checks, so a value the form accepts is a value the Route
 * Handler accepts; the database constraints stay authoritative.
 */

const R = PRODUCT_RULES;
const V = VARIANT_RULES;

/* ------------------------------------------------------------ messages */

export const MESSAGES = {
  name: `Use ${R.nameMin}–${R.nameMax} characters.`,
  description: `Use ${R.descriptionMin}–${R.descriptionMax} characters, or leave it empty.`,
  price: `Enter a price between ${R.priceMin} and ${R.priceMax.toLocaleString("en-US")}.`,
  discount: `Enter a discount between ${R.discountMin} and ${R.discountMax} %.`,
  label: `Use ${R.labelMin}–${R.labelMax} characters, or leave it empty.`,
  hex: "Use a hex colour like #1A2B3C.",
  size: `Use ${V.sizeMin}–${V.sizeMax} characters.`,
  colorName: `Use ${V.colorNameMin}–${V.colorNameMax} characters.`,
  stock: "Enter a whole number.",
  maxPreorder: "Enter a whole number of 0 or more.",
  duplicateVariant: "Another variant already has this size and colour.",
} as const;

/* ----------------------------------------------------- shared predicates */

const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const optionalLength = (value: string, min: number, max: number) => value === "" || (value.length >= min && value.length <= max);

/** Canonical identity used by variants_identity_key after the normalise trigger. */
export function variantIdentity(size: string, colorHash: string): string {
  return `${size.trim().toUpperCase()}|${colorHash.trim().toUpperCase()}`;
}

/* ------------------------------------------------------- form (strings) */

export type VariantFormValue = {
  /** Stable client key; equals `id` (new variants get a client-generated id). */
  key: string;
  id: string;
  isNew: boolean;
  /** Existing variant marked for deletion on save (kept so it can be restored). */
  removed: boolean;
  size: string;
  colorHash: string;
  colorName: string;
  stock: string;
  isActive: boolean;
  preorderEnabled: boolean;
  maxPreorder: string;
  image: ImageValue;
};

export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  discount: string;
  label: string;
  /** "" = none. */
  labelColor: string;
  labelBg: string;
  /** "" = none. */
  brandId: string;
  categoryId: string;
  collectionId: string;
  isActive: boolean;
  coverImage: ImageValue;
  sizeTableImage: ImageValue;
  variants: VariantFormValue[];
};

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const NON_NEGATIVE_INTEGER = /^\d+$/;

const decimalString = (message: string, min: number, max: number) =>
  z.string().trim().refine((value) => DECIMAL.test(value) && inRange(Number(value), min, max), message);

const integerString = (pattern: RegExp, message: string) =>
  z.string().trim().refine((value) => pattern.test(value) && Math.abs(Number(value)) <= SAFE_BIGINT, message);

const relationId = z.union([z.literal(""), z.uuid("Choose a valid option.")]);
const optionalHex = z.string().trim().refine((value) => value === "" || HEX_COLOR_PATTERN.test(value), MESSAGES.hex);

const variantFormSchema = z.object({
  key: z.string(),
  id: z.string(),
  isNew: z.boolean(),
  removed: z.boolean(),
  size: z.string().trim().min(V.sizeMin, "Enter a size.").max(V.sizeMax, MESSAGES.size),
  colorHash: z.string().trim().regex(HEX_COLOR_PATTERN, MESSAGES.hex),
  colorName: z.string().trim().min(V.colorNameMin, MESSAGES.colorName).max(V.colorNameMax, MESSAGES.colorName),
  stock: integerString(INTEGER, MESSAGES.stock),
  isActive: z.boolean(),
  preorderEnabled: z.boolean(),
  maxPreorder: integerString(NON_NEGATIVE_INTEGER, MESSAGES.maxPreorder),
  image: z.custom<ImageValue>(),
});

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").min(R.nameMin, MESSAGES.name).max(R.nameMax, MESSAGES.name),
    description: z.string().trim().refine((value) => optionalLength(value, R.descriptionMin, R.descriptionMax), MESSAGES.description),
    price: decimalString(MESSAGES.price, R.priceMin, R.priceMax),
    discount: decimalString(MESSAGES.discount, R.discountMin, R.discountMax),
    label: z.string().trim().refine((value) => optionalLength(value, R.labelMin, R.labelMax), MESSAGES.label),
    labelColor: optionalHex,
    labelBg: optionalHex,
    brandId: relationId,
    categoryId: relationId,
    collectionId: relationId,
    isActive: z.boolean(),
    coverImage: z.custom<ImageValue>(),
    sizeTableImage: z.custom<ImageValue>(),
    variants: z.array(z.unknown()).max(V.maxVariantsPerSave, `A product can be saved with up to ${V.maxVariantsPerSave} variants at a time.`),
  })
  .superRefine((values, ctx) => {
    // Removed rows are not validated (they will be deleted), but still occupy
    // their identity until the save, which deletes them first.
    const seen = new Map<string, number>();
    values.variants.forEach((raw, index) => {
      const variant = raw as VariantFormValue;
      if (variant.removed) return;
      const result = variantFormSchema.safeParse(variant);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: "custom", message: issue.message, path: ["variants", index, ...issue.path] });
        }
        return;
      }
      const identity = variantIdentity(variant.size, variant.colorHash);
      const first = seen.get(identity);
      if (first !== undefined) {
        ctx.addIssue({ code: "custom", message: MESSAGES.duplicateVariant, path: ["variants", index, "size"] });
      } else {
        seen.set(identity, index);
      }
    });
  });

/* ---------------------------------------------------- wire payload (JSON) */

export const imageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("set"), path: z.string().regex(STORAGE_PATH_PATTERN, "Invalid image reference.") }),
]);
export type ImageAction = z.infer<typeof imageActionSchema>;

const nullableTrimmed = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => optionalLength(value, min, max), message)
    .nullable()
    .transform((value) => (value ? value : null));

const nullableHex = z
  .string()
  .trim()
  .refine((value) => value === "" || HEX_COLOR_PATTERN.test(value), MESSAGES.hex)
  .nullable()
  .transform((value) => (value ? value.toUpperCase() : null));

const productPayloadSchema = z.object({
  name: z.string().trim().min(R.nameMin, MESSAGES.name).max(R.nameMax, MESSAGES.name),
  description: nullableTrimmed(R.descriptionMin, R.descriptionMax, MESSAGES.description),
  price: z.number().refine((value) => inRange(value, R.priceMin, R.priceMax), MESSAGES.price),
  discount: z.number().refine((value) => inRange(value, R.discountMin, R.discountMax), MESSAGES.discount),
  label: nullableTrimmed(R.labelMin, R.labelMax, MESSAGES.label),
  labelColor: nullableHex,
  labelBg: nullableHex,
  brandId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  collectionId: z.uuid().nullable(),
  isActive: z.boolean(),
  coverImage: imageActionSchema,
  sizeTableImage: imageActionSchema,
});

const sizeField = z.string().trim().min(V.sizeMin, MESSAGES.size).max(V.sizeMax, MESSAGES.size);
const colorHashField = z.string().trim().regex(HEX_COLOR_PATTERN, MESSAGES.hex);
const colorNameField = z.string().trim().min(V.colorNameMin, MESSAGES.colorName).max(V.colorNameMax, MESSAGES.colorName);
const stockField = z.number().int(MESSAGES.stock).min(-SAFE_BIGINT).max(SAFE_BIGINT);
const maxPreorderField = z.number().int(MESSAGES.maxPreorder).min(V.maxPreorderMin, MESSAGES.maxPreorder).max(SAFE_BIGINT);
const refField = z.string().min(1).max(64);

const variantInsertSchema = z.object({
  op: z.literal("insert"),
  ref: refField,
  id: z.uuid(),
  size: sizeField,
  colorHash: colorHashField,
  colorName: colorNameField,
  stock: stockField,
  isActive: z.boolean(),
  preorderEnabled: z.boolean(),
  maximumPreorderQuantity: maxPreorderField,
  image: z.discriminatedUnion("action", [
    z.object({ action: z.literal("keep") }),
    z.object({ action: z.literal("set"), path: z.string().regex(STORAGE_PATH_PATTERN, "Invalid image reference.") }),
  ]),
});

/** Only the fields the admin changed are sent, so untouched values (e.g. stock moved by orders) are never overwritten. */
const variantUpdateSchema = z.object({
  op: z.literal("update"),
  ref: refField,
  id: z.uuid(),
  size: sizeField.optional(),
  colorHash: colorHashField.optional(),
  colorName: colorNameField.optional(),
  stock: stockField.optional(),
  isActive: z.boolean().optional(),
  preorderEnabled: z.boolean().optional(),
  maximumPreorderQuantity: maxPreorderField.optional(),
  image: imageActionSchema.optional(),
});

export const productSavePayloadSchema = z
  .object({
    id: z.uuid(),
    product: productPayloadSchema,
    variants: z.array(z.discriminatedUnion("op", [variantInsertSchema, variantUpdateSchema])).max(V.maxVariantsPerSave),
    removedVariantIds: z.array(z.uuid()).max(V.maxVariantsPerSave),
    /** Optimistic concurrency token from the loaded product (update only). */
    expectedUpdatedAt: z.string().min(10).max(64).optional(),
    /** Overwrite even if the product changed since it was loaded. */
    force: z.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    payload.variants.forEach((variant, index) => {
      if (refs.has(variant.ref)) ctx.addIssue({ code: "custom", message: "Duplicate variant reference.", path: ["variants", index, "ref"] });
      refs.add(variant.ref);
    });
  });

export type ProductSavePayload = z.input<typeof productSavePayloadSchema>;
export type ParsedProductSavePayload = z.output<typeof productSavePayloadSchema>;
export type VariantChange = ProductSavePayload["variants"][number];

/** Server-side Zod issues → product form paths (`price`, `variants.<ref>.size`). */
export function payloadIssuesToFieldErrors(error: z.ZodError, payload: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  const variants = (payload as { variants?: { ref?: unknown }[] } | null)?.variants;
  for (const issue of error.issues) {
    let key: string | null = null;
    if (issue.path[0] === "product" && typeof issue.path[1] === "string") key = issue.path[1];
    if (issue.path[0] === "variants" && typeof issue.path[1] === "number") {
      const ref = variants?.[issue.path[1]]?.ref;
      if (typeof ref === "string") key = `variants.${ref}${typeof issue.path[2] === "string" ? `.${issue.path[2]}` : ""}`;
    }
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}
