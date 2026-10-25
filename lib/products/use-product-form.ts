"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, type FieldErrors as RHFFieldErrors, type FieldPath, type Resolver } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useGuardedNavigation, useUnsavedChangesGuard } from "@/components/dashboard/navigation-guard";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { discardImageFromBucket, ImagePreparationError, uploadImageToBucket } from "@/lib/entities/form-client";
import { PRODUCT_BUCKETS, type ProductBucket } from "@/lib/products/constants";
import { createProductRequest, fetchProduct, updateProductRequest } from "@/lib/products/client";
import { ProductRequestError } from "@/lib/products/errors";
import {
  productFormSchema,
  variantIdentity,
  type ImageAction,
  type ProductFormValues,
  type ProductSavePayload,
  type VariantChange,
  type VariantFormValue,
} from "@/lib/products/form-schema";
import { invalidateProductQueries, productKeys } from "@/lib/products/hooks";
import type { ProductDetail, ProductVariant } from "@/lib/products/types";

export type ProductFormMode = { kind: "create" } | { kind: "edit"; product: ProductDetail };

export type ProductFormNotice =
  | { kind: "error"; message: string }
  | { kind: "uncertain"; message: string }
  | { kind: "stale" }
  | { kind: "gone"; message: string }
  | { kind: "forbidden"; message: string };

export type ProductFormPhase = "idle" | "uploading" | "saving" | "verifying";

/* ---------------------------------------------------------------- values */

/**
 * A new, unsaved variant row. `key` must be deterministic when rendered on the
 * server (the default row of the create form), so it is passed in there; rows
 * added later in the browser get a random one. Its database id is assigned in
 * the browser when the first save is built (see `variantIds` in the hook).
 */
export function newVariant(seed?: Partial<VariantFormValue>, key: string = crypto.randomUUID()): VariantFormValue {
  return {
    key,
    id: "",
    isNew: true,
    removed: false,
    size: "",
    colorHash: "#000000",
    colorName: "",
    // Same default as variants.stock.
    stock: "1",
    isActive: true,
    preorderEnabled: false,
    maxPreorder: "0",
    image: { kind: "none" },
    ...seed,
  };
}

function variantToForm(variant: ProductVariant): VariantFormValue {
  return {
    key: variant.id,
    id: variant.id,
    isNew: false,
    removed: false,
    size: variant.size,
    colorHash: variant.colorHash,
    colorName: variant.colorName,
    stock: String(variant.stock),
    isActive: variant.isActive,
    preorderEnabled: variant.preorderEnabled,
    maxPreorder: String(variant.maximumPreorderQuantity),
    image: variant.imageUrl ? { kind: "existing", url: variant.imageUrl } : { kind: "none" },
  };
}

export function toProductFormValues(product: ProductDetail | null): ProductFormValues {
  if (!product) {
    return {
      name: "",
      description: "",
      price: "",
      discount: "0",
      label: "",
      labelColor: "",
      labelBg: "",
      brandId: "",
      categoryId: "",
      collectionId: "",
      isActive: true,
      coverImage: { kind: "none" },
      sizeTableImage: { kind: "none" },
      variants: [newVariant(undefined, "new-initial")],
    };
  }
  return {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    discount: String(product.discount),
    label: product.label ?? "",
    labelColor: product.labelColor ?? "",
    labelBg: product.labelBg ?? "",
    brandId: product.brand?.id ?? "",
    categoryId: product.category?.id ?? "",
    collectionId: product.collection?.id ?? "",
    isActive: product.isActive,
    coverImage: product.coverImageUrl ? { kind: "existing", url: product.coverImageUrl } : { kind: "none" },
    sizeTableImage: product.sizeTableImageUrl ? { kind: "existing", url: product.sizeTableImageUrl } : { kind: "none" },
    variants: product.variants.map(variantToForm),
  };
}

/* -------------------------------------------------------------- resolver */

function setNested(target: Record<string, unknown>, path: PropertyKey[], value: unknown) {
  let cursor: Record<PropertyKey, unknown> = target;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      if (cursor[key] === undefined) cursor[key] = value;
      return;
    }
    if (cursor[key] === undefined) cursor[key] = typeof path[index + 1] === "number" ? [] : {};
    cursor = cursor[key] as Record<PropertyKey, unknown>;
  });
}

/** Zod → React Hook Form, including nested field-array paths (`variants.2.size`). */
const productResolver: Resolver<ProductFormValues> = async (values) => {
  const result = productFormSchema.safeParse(values);
  if (result.success) return { values, errors: {} };
  const errors: Record<string, unknown> = {};
  for (const issue of result.error.issues) {
    setNested(errors, issue.path, { type: issue.code, message: issue.message });
  }
  return { values: {}, errors: errors as RHFFieldErrors<ProductFormValues> };
};

/* --------------------------------------------------------------- payload */

type UploadKey = string; // "cover" | "sizeTable" | `variant:${key}`
type Upload = { file: File; path: string; bucket: ProductBucket };

const toNumber = (value: string) => Number(value.trim());

function imageAction(value: VariantFormValue["image"], hadImage: boolean, uploaded: Upload | undefined): ImageAction {
  if (value.kind === "new" && uploaded) return { action: "set", path: uploaded.path };
  if (value.kind === "none" && hadImage) return { action: "remove" };
  return { action: "keep" };
}

/** Only fields that differ from the loaded variant — so stock moved by orders is never overwritten. */
function variantDiff(value: VariantFormValue, base: ProductVariant, upload: Upload | undefined): VariantChange | null {
  const change: Extract<VariantChange, { op: "update" }> = { op: "update", ref: value.key, id: value.id };
  let changed = false;
  const set = <K extends keyof typeof change>(key: K, next: (typeof change)[K]) => {
    change[key] = next;
    changed = true;
  };

  if (value.size.trim().toUpperCase() !== base.size) set("size", value.size.trim());
  if (value.colorHash.trim().toUpperCase() !== base.colorHash.toUpperCase()) set("colorHash", value.colorHash.trim().toUpperCase());
  if (value.colorName.trim() !== base.colorName) set("colorName", value.colorName.trim());
  if (toNumber(value.stock) !== base.stock) set("stock", toNumber(value.stock));
  if (value.isActive !== base.isActive) set("isActive", value.isActive);
  if (value.preorderEnabled !== base.preorderEnabled) set("preorderEnabled", value.preorderEnabled);
  if (toNumber(value.maxPreorder) !== base.maximumPreorderQuantity) set("maximumPreorderQuantity", toNumber(value.maxPreorder));
  const image = imageAction(value.image, base.imageUrl !== null, upload);
  if (image.action !== "keep") set("image", image);

  return changed ? change : null;
}

export function buildSavePayload(
  values: ProductFormValues,
  baseline: ProductDetail | null,
  productId: string,
  uploads: Map<UploadKey, Upload>,
  force?: boolean,
  /** Stable database id for a new variant row (same id on every retry). */
  idForNew: (key: string) => string = () => crypto.randomUUID(),
): ProductSavePayload {
  const label = values.label.trim();
  const product: ProductSavePayload["product"] = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    price: toNumber(values.price),
    discount: toNumber(values.discount),
    label: label || null,
    // Colours only mean something with a label; without one they're cleared.
    labelColor: label && values.labelColor ? values.labelColor.toUpperCase() : null,
    labelBg: label && values.labelBg ? values.labelBg.toUpperCase() : null,
    brandId: values.brandId || null,
    categoryId: values.categoryId || null,
    collectionId: values.collectionId || null,
    isActive: values.isActive,
    coverImage: imageAction(values.coverImage, Boolean(baseline?.coverImageUrl), uploads.get("cover")),
    sizeTableImage: imageAction(values.sizeTableImage, Boolean(baseline?.sizeTableImageUrl), uploads.get("sizeTable")),
  };

  const baseVariants = new Map((baseline?.variants ?? []).map((variant) => [variant.id, variant]));
  const variants: VariantChange[] = [];
  const removedVariantIds: string[] = [];

  for (const value of values.variants) {
    const upload = uploads.get(`variant:${value.key}`);
    if (value.isNew) {
      if (value.removed) continue;
      variants.push({
        op: "insert",
        ref: value.key,
        id: value.id || idForNew(value.key),
        size: value.size.trim(),
        colorHash: value.colorHash.trim().toUpperCase(),
        colorName: value.colorName.trim(),
        stock: toNumber(value.stock),
        isActive: value.isActive,
        preorderEnabled: value.preorderEnabled,
        maximumPreorderQuantity: toNumber(value.maxPreorder),
        image: value.image.kind === "new" && upload ? { action: "set", path: upload.path } : { action: "keep" },
      });
      continue;
    }
    const base = baseVariants.get(value.id);
    if (!base) continue;
    if (value.removed) {
      removedVariantIds.push(value.id);
      continue;
    }
    const change = variantDiff(value, base, upload);
    if (change) variants.push(change);
  }

  return {
    id: productId,
    product,
    variants,
    removedVariantIds,
    ...(baseline ? { expectedUpdatedAt: baseline.updatedAt } : {}),
    ...(force ? { force: true } : {}),
  };
}

/* ------------------------------------------------------- server errors */

const VARIANT_FIELD_MAP: Record<string, keyof VariantFormValue> = {
  size: "size",
  colorHash: "colorHash",
  colorName: "colorName",
  stock: "stock",
  maximumPreorderQuantity: "maxPreorder",
  image: "image",
  isActive: "isActive",
  preorderEnabled: "preorderEnabled",
};

const PRODUCT_FIELDS = new Set<keyof ProductFormValues>([
  "name",
  "description",
  "price",
  "discount",
  "label",
  "labelColor",
  "labelBg",
  "brandId",
  "categoryId",
  "collectionId",
  "coverImage",
  "sizeTableImage",
]);

/* ---------------------------------------------------------------- hook */

export function useProductForm({ mode, returnTo }: { mode: ProductFormMode; returnTo: string }) {
  const queryClient = useQueryClient();
  const { navigate, release } = useGuardedNavigation();

  const [baseline, setBaseline] = useState<ProductDetail | null>(mode.kind === "edit" ? mode.product : null);
  const form = useForm<ProductFormValues>({
    defaultValues: toProductFormValues(baseline),
    resolver: productResolver,
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const [phase, setPhase] = useState<ProductFormPhase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<ProductFormNotice | null>(null);
  /** Row-level messages (e.g. "can't be deleted"), keyed by variant key. */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Stable across retries: lets an uncertain create be verified and re-uses
  // already uploaded images instead of uploading them twice.
  const productIdRef = useRef<string>(mode.kind === "edit" ? mode.product.id : "");
  const uploadsRef = useRef<Map<UploadKey, Upload>>(new Map());
  // New variant row key → its client-generated id, kept across retries so an
  // uncertain save can be verified and never inserts twice.
  const variantIdsRef = useRef<Map<string, string>>(new Map());
  const idForNew = (key: string) => {
    let id = variantIdsRef.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      variantIdsRef.current.set(key, id);
    }
    return id;
  };
  const [uncertain, setUncertainState] = useState(false);
  const uncertainRef = useRef(false);
  const setUncertain = (value: boolean) => {
    uncertainRef.current = value;
    setUncertainState(value);
  };
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!productIdRef.current) productIdRef.current = crypto.randomUUID();
  }, []);

  const isDirty = form.formState.isDirty;
  const busy = phase !== "idle";

  function discardUploads() {
    for (const upload of uploadsRef.current.values()) void discardImageFromBucket(upload.bucket, upload.path);
    uploadsRef.current.clear();
  }

  useUnsavedChangesGuard({
    when: isDirty || busy || uncertain,
    // "Discard changes" really discards: Next keeps visited pages alive.
    onDiscard: () => resetToBaseline(),
    message: () =>
      submittingRef.current
        ? { title: "Leave while saving?", description: "Your changes are still being saved. If you leave now, you won't see whether saving succeeded." }
        : { title: "Discard unsaved changes?", description: "This product has changes that haven't been saved. If you leave now, they will be lost." },
  });

  // Remove uploads that never got attached (user left after a failed save).
  useEffect(() => {
    const uploads = uploadsRef.current;
    return () => {
      if (!uncertainRef.current && uploads.size) {
        for (const upload of uploads.values()) void discardImageFromBucket(upload.bucket, upload.path);
        uploads.clear();
      }
    };
  }, []);

  function resetToBaseline(next: ProductDetail | null = baseline) {
    if (!uncertainRef.current) discardUploads();
    else uploadsRef.current.clear();
    if (mode.kind === "create") productIdRef.current = crypto.randomUUID();
    variantIdsRef.current.clear();
    setUncertain(false);
    setNotice(null);
    setRowErrors({});
    form.reset(toProductFormValues(next));
  }

  /* --------------------------------------------------------- uploads */

  async function uploadNewImages(values: ProductFormValues): Promise<boolean> {
    const wanted: { key: UploadKey; file: File; bucket: ProductBucket; field: FieldPath<ProductFormValues> }[] = [];
    if (values.coverImage.kind === "new") wanted.push({ key: "cover", file: values.coverImage.file, bucket: PRODUCT_BUCKETS.cover, field: "coverImage" });
    if (values.sizeTableImage.kind === "new")
      wanted.push({ key: "sizeTable", file: values.sizeTableImage.file, bucket: PRODUCT_BUCKETS.sizeTable, field: "sizeTableImage" });
    values.variants.forEach((variant, index) => {
      if (!variant.removed && variant.image.kind === "new") {
        wanted.push({ key: `variant:${variant.key}`, file: variant.image.file, bucket: PRODUCT_BUCKETS.variant, field: `variants.${index}.image` });
      }
    });

    // Forget uploads whose image was replaced or removed since.
    const wantedKeys = new Set(wanted.map((item) => item.key));
    for (const [key, upload] of uploadsRef.current) {
      const current = wanted.find((item) => item.key === key);
      if (!wantedKeys.has(key) || current?.file !== upload.file) {
        void discardImageFromBucket(upload.bucket, upload.path);
        uploadsRef.current.delete(key);
      }
    }

    const pending = wanted.filter((item) => !uploadsRef.current.has(item.key));
    if (pending.length === 0) return true;

    setPhase("uploading");
    setProgress({ done: 0, total: pending.length });
    for (const [index, item] of pending.entries()) {
      try {
        const path = await uploadImageToBucket(item.bucket, item.file);
        uploadsRef.current.set(item.key, { file: item.file, path, bucket: item.bucket });
        setProgress({ done: index + 1, total: pending.length });
      } catch (error) {
        if (error instanceof ImagePreparationError) {
          form.setError(item.field, { type: "server", message: error.message });
        } else {
          const failure = toEntityError(error);
          if (failure.code === "forbidden") setNotice({ kind: "forbidden", message: failure.message });
          else form.setError(item.field, { type: "server", message: failure.message });
        }
        return false;
      }
    }
    return true;
  }

  /* ---------------------------------------------------------- results */

  function finishSuccess(result: { id: string }, options: { imageCleanupFailed?: boolean } = {}) {
    uploadsRef.current.clear(); // now referenced by saved rows
    variantIdsRef.current.clear();
    release(); // the redirect below must not trigger the unsaved-changes dialog
    setUncertain(false);
    setNotice(null);
    setRowErrors({});
    const name = form.getValues("name").trim();
    // Clean (Activity-preserved) page if revisited.
    if (mode.kind === "create") {
      productIdRef.current = crypto.randomUUID();
      form.reset(toProductFormValues(null));
    } else {
      form.reset(form.getValues());
    }
    invalidateProductQueries(queryClient);
    queryClient.removeQueries({ queryKey: productKeys.editable(result.id) });
    toast.success(mode.kind === "create" ? `“${name}” was created.` : `Changes to “${name}” were saved.`, {
      description: options.imageCleanupFailed ? "A replaced image couldn't be removed from storage; it will be cleaned up later." : undefined,
    });
    navigate(returnTo);
  }

  function applyServerFieldErrors(fieldErrors: Record<string, string>) {
    const values = form.getValues();
    const indexByKey = new Map(values.variants.map((variant, index) => [variant.key, index]));
    const rows: Record<string, string> = {};
    let firstField: FieldPath<ProductFormValues> | null = null;

    for (const [path, message] of Object.entries(fieldErrors)) {
      const variantMatch = /^variants\.([^.]+)(?:\.(\w+))?$/.exec(path);
      if (variantMatch) {
        const [, key, field] = variantMatch;
        const index = indexByKey.get(key);
        if (index === undefined) continue;
        const formField = field ? VARIANT_FIELD_MAP[field] : undefined;
        if (formField) {
          const target = `variants.${index}.${formField}` as FieldPath<ProductFormValues>;
          form.setError(target, { type: "server", message });
          firstField ??= target;
        } else {
          rows[key] = message;
        }
        continue;
      }
      if (PRODUCT_FIELDS.has(path as keyof ProductFormValues)) {
        form.setError(path as FieldPath<ProductFormValues>, { type: "server", message });
        firstField ??= path as FieldPath<ProductFormValues>;
      }
    }
    setRowErrors(rows);
    if (firstField && !/image/i.test(firstField)) form.setFocus(firstField);
    return Object.keys(rows).length > 0 || firstField !== null;
  }

  /** After a timeout: did the create commit? (Atomic RPC: product exists ⇔ everything was saved.) */
  async function verifyCreate(): Promise<"created" | "absent" | "unknown"> {
    try {
      await fetchProduct(productIdRef.current);
      finishSuccess({ id: productIdRef.current });
      return "created";
    } catch (error) {
      if (error instanceof EntityRequestError && error.code === "not_found") return "absent";
      return "unknown";
    }
  }

  /** After a timeout: compare the stored product with what was sent. */
  async function verifyUpdate(payload: ProductSavePayload): Promise<"applied" | "not-applied" | "stale" | "unknown"> {
    try {
      const stored = await fetchProduct(baseline!.id);
      if (stored.updatedAt === baseline!.updatedAt) return "not-applied";
      const ids = new Set(stored.variants.map((variant) => variant.id));
      const matches =
        stored.name === payload.product.name &&
        stored.price === payload.product.price &&
        stored.discount === payload.product.discount &&
        stored.isActive === payload.product.isActive &&
        (stored.brand?.id ?? null) === payload.product.brandId &&
        (stored.category?.id ?? null) === payload.product.categoryId &&
        (stored.collection?.id ?? null) === payload.product.collectionId &&
        payload.removedVariantIds.every((id) => !ids.has(id)) &&
        payload.variants.every((variant) => variant.op === "update" || ids.has(variant.id));
      if (matches) {
        finishSuccess({ id: stored.id });
        return "applied";
      }
      return "stale";
    } catch (error) {
      if (error instanceof EntityRequestError && error.code === "not_found") {
        setNotice({ kind: "gone", message: "This product was deleted while you were editing it." });
      }
      return "unknown";
    }
  }

  /* ----------------------------------------------------------- submit */

  async function save(values: ProductFormValues, options: { force?: boolean } = {}) {
    if (submittingRef.current) return; // duplicate submissions
    submittingRef.current = true;
    setNotice(null);
    setRowErrors({});

    try {
      // A previous attempt timed out: never resubmit blindly.
      if (uncertainRef.current) {
        setPhase("verifying");
        if (mode.kind === "create") {
          const outcome = await verifyCreate();
          if (outcome === "created") return;
          if (outcome === "unknown") {
            setNotice({ kind: "uncertain", message: "We still can't confirm whether the product was created. Check your connection, then try again." });
            return;
          }
        } else {
          const outcome = await verifyUpdate(buildSavePayload(values, baseline, productIdRef.current, uploadsRef.current, options.force, idForNew));
          if (outcome === "applied") return;
          if (outcome === "stale") {
            setUncertain(false);
            setNotice({ kind: "stale" });
            return;
          }
          if (outcome === "unknown") {
            setNotice((current) => current ?? { kind: "uncertain", message: "We still can't confirm whether your changes were saved. Check your connection, then try again." });
            return;
          }
        }
        setUncertain(false);
      }

      if (!(await uploadNewImages(values))) return;

      setPhase("saving");
      const payload = buildSavePayload(values, baseline, productIdRef.current, uploadsRef.current, options.force, idForNew);
      const result =
        mode.kind === "create" ? await createProductRequest(payload) : await updateProductRequest(baseline!.id, payload);
      finishSuccess(result, { imageCleanupFailed: result.imageCleanupFailed });
    } catch (error) {
      handleWriteError(toEntityError(error));
    } finally {
      submittingRef.current = false;
      setPhase("idle");
      setProgress(null);
    }
  }

  function handleWriteError(error: EntityRequestError) {
    if (error.isUncertain) {
      // The request may have committed: keep uploads and require a check first.
      setUncertain(true);
      setNotice({
        kind: "uncertain",
        message:
          mode.kind === "create"
            ? "We couldn't confirm whether the product was created. Use “Check & retry” — we'll check first, so it can't be created twice."
            : "We couldn't confirm whether your changes were saved. Use “Check & retry” — we'll check the saved version first.",
      });
      return;
    }

    const fieldErrors = error instanceof ProductRequestError ? error.productFieldErrors : undefined;
    if (fieldErrors) {
      // Definitely not saved. An upload the database rejected must be redone.
      for (const key of Object.keys(fieldErrors)) {
        if (key === "coverImage") uploadsRef.current.delete("cover");
        if (key === "sizeTableImage") uploadsRef.current.delete("sizeTable");
        const variantImage = /^variants\.([^.]+)\.image$/.exec(key);
        if (variantImage) uploadsRef.current.delete(`variant:${variantImage[1]}`);
      }
      const applied = applyServerFieldErrors(fieldErrors);
      if (error.code === "stale") setNotice({ kind: "stale" });
      else if (!applied) setNotice({ kind: "error", message: error.message });
      return;
    }
    switch (error.code) {
      case "stale":
        setNotice({ kind: "stale" });
        return;
      case "not_found":
        setNotice({ kind: "gone", message: error.message });
        return;
      case "forbidden":
      case "unauthenticated":
        setNotice({ kind: "forbidden", message: error.message });
        return;
      default:
        setNotice({ kind: "error", message: error.message });
    }
  }

  /** Stale record: replace the form with the latest saved version. */
  async function loadLatest() {
    if (!baseline) return;
    setPhase("verifying");
    try {
      const latest = await fetchProduct(baseline.id);
      setBaseline(latest);
      resetToBaseline(latest);
      toast.message("Loaded the latest saved version.");
    } catch (error) {
      const failure = toEntityError(error);
      setNotice(failure.code === "not_found" ? { kind: "gone", message: failure.message } : { kind: "error", message: failure.message });
    } finally {
      setPhase("idle");
    }
  }

  return {
    form,
    mode,
    baseline,
    phase,
    progress,
    busy,
    isDirty,
    notice,
    uncertain,
    rowErrors,
    clearRowError: (key: string) =>
      setRowErrors((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }),
    // handleSubmit is created at event time because the submit flow reads refs.
    submit: (event?: React.BaseSyntheticEvent) => form.handleSubmit((values) => save(values))(event),
    overwrite: () => form.handleSubmit((values) => save(values, { force: true }))(),
    loadLatest,
  };
}

export type ProductFormController = ReturnType<typeof useProductForm>;

/** Variants sharing a size + colour among the visible rows (live hint before validation). */
export function duplicateVariantKeys(variants: VariantFormValue[]): Set<string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const variant of variants) {
    if (variant.removed || !variant.size.trim()) continue;
    const identity = variantIdentity(variant.size, variant.colorHash);
    const first = seen.get(identity);
    if (first) {
      duplicates.add(first);
      duplicates.add(variant.key);
    } else seen.set(identity, variant.key);
  }
  return duplicates;
}
