"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Controller, useWatch, type FieldErrors } from "react-hook-form";
import { AlertTriangle, CircleAlert, Loader2, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormSection } from "@/components/dashboard/entities/form-field";
import { ImageField } from "@/components/dashboard/entities/image-field";
import { RelationCombobox, type RelationItem } from "@/components/dashboard/products/form/relation-combobox";
import { VariantEditor } from "@/components/dashboard/products/form/variant-editor";
import { ProductLabelBadge } from "@/components/dashboard/products/product-label-badge";
import { HEX_COLOR_PATTERN, PRODUCT_RULES } from "@/lib/products/constants";
import { discountedPrice, formatPrice } from "@/lib/products/format";
import type { ProductFormValues } from "@/lib/products/form-schema";
import { useProductOptions } from "@/lib/products/hooks";
import { useProductForm, type ProductFormController, type ProductFormMode } from "@/lib/products/use-product-form";
import { cn } from "@/lib/utils";

type Props = { mode: ProductFormMode; returnTo: string };

const ALL_DEPARTMENTS = "__all__";

const FIELD_LABELS: Partial<Record<keyof ProductFormValues, string>> = {
  name: "Name",
  description: "Description",
  price: "Price",
  discount: "Discount",
  categoryId: "Category",
  brandId: "Brand",
  collectionId: "Collection",
  label: "Label",
  labelColor: "Label text colour",
  labelBg: "Label background",
  coverImage: "Cover image",
  sizeTableImage: "Size table image",
};

/**
 * The ONE product form, used by /products/new and /products/[id]/edit.
 * Product fields and variants are saved together in a single transaction.
 */
export function ProductForm({ mode, returnTo }: Props) {
  const controller = useProductForm({ mode, returnTo });
  const { form, phase, progress, busy, isDirty, uncertain, baseline, rowErrors } = controller;
  const { errors, submitCount } = form.formState;
  const options = useProductOptions();
  const isEdit = mode.kind === "edit";

  const [name, description, price, discount, label, labelColor, labelBg, categoryId] = useWatch({
    control: form.control,
    name: ["name", "description", "price", "discount", "label", "labelColor", "labelBg", "categoryId"],
  });

  const baseVariants = useMemo(() => new Map((baseline?.variants ?? []).map((variant) => [variant.id, variant])), [baseline]);

  /* --------------------------------------------- relation options */

  const categories = options.data?.categories ?? [];
  const departmentById = useMemo(() => new Map((options.data?.departments ?? []).map((d) => [d.id, d])), [options.data]);
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  // Department narrows the category list; it isn't stored on the product.
  const [departmentFilter, setDepartmentFilter] = useState<string>(() => baseline?.department?.id ?? "");
  const visibleCategories = departmentFilter ? categories.filter((category) => category.departmentId === departmentFilter) : categories;

  const toItems = (list: { id: string; name: string; isActive: boolean }[]): RelationItem[] =>
    list.map((option) => ({ value: option.id, label: option.name, hidden: !option.isActive }));
  const categoryItems: RelationItem[] = visibleCategories.map((category) => ({
    value: category.id,
    label: category.name,
    hidden: !category.isActive,
    hint: category.departmentId ? (departmentById.get(category.departmentId)?.name ?? undefined) : "No department",
  }));

  /* --------------------------------------------------- summary */

  const productErrorKeys = (Object.keys(FIELD_LABELS) as (keyof ProductFormValues)[]).filter((key) => errors[key]?.message);
  const variantErrorCount = countVariantErrors(errors) + Object.keys(rowErrors).length;
  const errorCount = productErrorKeys.length + variantErrorCount;

  const phaseLabel: Record<typeof phase, string> = {
    idle: "",
    uploading: progress ? `Uploading images (${progress.done}/${progress.total})…` : "Uploading images…",
    saving: isEdit ? "Saving product and variants…" : "Creating product and variants…",
    verifying: "Checking what was saved…",
  };
  const submitLabel = uncertain ? "Check & retry" : isEdit ? "Save changes" : "Create product";
  const finalPrice = discountedPrice(Number(price), Number(discount));
  const priceValid = /^\d+(\.\d+)?$/.test(price.trim()) && Number(price) >= PRODUCT_RULES.priceMin;
  const discountValid = /^\d+(\.\d+)?$/.test(discount.trim());

  return (
    <form onSubmit={controller.submit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-24" aria-busy={busy}>
      <NoticeBanner controller={controller} returnTo={returnTo} />

      {submitCount > 0 && errorCount > 0 && !busy && (
        <div role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`}
          </p>
          <ul className="mt-2 grid gap-1 pl-6 text-destructive">
            {productErrorKeys.map((key) => (
              <li key={key}>
                <a href={`#field-${key}`} className="underline underline-offset-2 hover:no-underline">
                  {FIELD_LABELS[key]}
                </a>
                : {errors[key]?.message as string}
              </li>
            ))}
            {variantErrorCount > 0 && (
              <li>
                <a href="#section-variants" className="underline underline-offset-2 hover:no-underline">
                  Variants
                </a>
                : {variantErrorCount === 1 ? "1 problem" : `${variantErrorCount} problems`} — see the highlighted rows.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          {/* ------------------------------------------------ details */}
          <FormSection title="Details" description="How this product is named and described on the storefront.">
            <FormField
              id="field-name"
              label="Name"
              required
              error={errors.name?.message}
              counter={`${name.trim().length} / ${PRODUCT_RULES.nameMax}`}
              description="The first two words are printed on barcode labels."
            >
              {(control) => (
                <Input {...control} {...form.register("name")} autoComplete="off" maxLength={PRODUCT_RULES.nameMax + 16} placeholder="e.g. Classic Denim Jacket" />
              )}
            </FormField>
            <FormField
              id="field-description"
              label="Description"
              error={errors.description?.message}
              counter={`${description.trim().length} / ${PRODUCT_RULES.descriptionMax}`}
              description={`Between ${PRODUCT_RULES.descriptionMin} and ${PRODUCT_RULES.descriptionMax} characters, or leave it empty.`}
            >
              {(control) => <Textarea {...control} {...form.register("description")} rows={5} placeholder="Fabric, fit, care instructions…" />}
            </FormField>
          </FormSection>

          {/* ------------------------------------------------ pricing */}
          <FormSection title="Pricing" description="One price for every variant of this product.">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                id="field-price"
                label="Price (EGP)"
                required
                error={errors.price?.message}
                description={`${PRODUCT_RULES.priceMin} – ${PRODUCT_RULES.priceMax.toLocaleString("en-US")}`}
              >
                {(control) => <Input {...control} {...form.register("price")} inputMode="decimal" autoComplete="off" placeholder="0" className="tabular-nums" />}
              </FormField>
              <FormField id="field-discount" label="Discount (%)" required error={errors.discount?.message} description={`${PRODUCT_RULES.discountMin} – ${PRODUCT_RULES.discountMax} %`}>
                {(control) => <Input {...control} {...form.register("discount")} inputMode="decimal" autoComplete="off" className="tabular-nums" />}
              </FormField>
            </div>
            <p className="flex flex-wrap items-baseline gap-2 border border-border bg-muted/30 px-3 py-2 text-sm" aria-live="polite">
              <span className="text-muted-foreground">Customers pay</span>
              <span className="font-semibold tabular-nums">{priceValid && discountValid ? formatPrice(finalPrice) : "—"}</span>
              {priceValid && discountValid && Number(discount) > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  <s>{formatPrice(Number(price))}</s> −{Number(discount)}%
                </span>
              )}
            </p>
          </FormSection>

          {/* ------------------------------------------- organisation */}
          <FormSection title="Organisation" description="Where the product appears in the store. All optional.">
            {options.isError && (
              <div role="alert" className="flex flex-col gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center">
                <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
                <span className="flex-1">Brands, categories and collections couldn&apos;t be loaded.</span>
                <Button type="button" variant="outline" size="xs" onClick={() => void options.refetch()}>
                  <RotateCcw aria-hidden />
                  Retry
                </Button>
              </div>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                id="field-department"
                label="Department"
                description={
                  selectedCategory
                    ? `From the category: ${selectedCategory.departmentId ? (departmentById.get(selectedCategory.departmentId)?.name ?? "—") : "no department"}.`
                    : "Narrows the category list. A product's department comes from its category."
                }
              >
                {(control) => (
                  <Select
                    items={{
                      [ALL_DEPARTMENTS]: "All departments",
                      ...Object.fromEntries((options.data?.departments ?? []).map((d) => [d.id, d.isActive ? d.name : `${d.name} (hidden)`])),
                    }}
                    value={departmentFilter || ALL_DEPARTMENTS}
                    onValueChange={(next) => {
                      const department = typeof next === "string" && next !== ALL_DEPARTMENTS ? next : "";
                      setDepartmentFilter(department);
                      if (department && selectedCategory && selectedCategory.departmentId !== department) {
                        form.setValue("categoryId", "", { shouldDirty: true, shouldValidate: true });
                      }
                    }}
                    disabled={busy || options.isPending}
                  >
                    <SelectTrigger id={control.id} aria-describedby={control["aria-describedby"]} className="w-full">
                      {options.isPending ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          Loading…
                        </span>
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
                      <SelectSeparator />
                      {(options.data?.departments ?? []).map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.isActive ? department.name : `${department.name} (hidden)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              <FormField id="field-categoryId" label="Category" error={errors.categoryId?.message}>
                {(control) => (
                  <Controller
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <RelationCombobox
                        control={control}
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          const chosen = categories.find((category) => category.id === value);
                          if (chosen && chosen.departmentId && departmentFilter !== chosen.departmentId) setDepartmentFilter(chosen.departmentId);
                        }}
                        onBlur={field.onBlur}
                        options={categoryItems}
                        placeholder={options.isPending ? "Loading categories…" : "No category"}
                        emptyText={categories.length === 0 ? "No categories yet. Create one under Categories." : "No matching categories."}
                        disabled={busy || options.isPending}
                        fallbackLabel={baseline?.category?.id === field.value ? baseline.category.name : undefined}
                      />
                    )}
                  />
                )}
              </FormField>

              <FormField id="field-brandId" label="Brand" error={errors.brandId?.message}>
                {(control) => (
                  <Controller
                    control={form.control}
                    name="brandId"
                    render={({ field }) => (
                      <RelationCombobox
                        control={control}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        options={toItems(options.data?.brands ?? [])}
                        placeholder={options.isPending ? "Loading brands…" : "No brand"}
                        emptyText={(options.data?.brands ?? []).length === 0 ? "No brands yet. Create one under Brands." : "No matching brands."}
                        disabled={busy || options.isPending}
                        fallbackLabel={baseline?.brand?.id === field.value ? baseline.brand.name : undefined}
                      />
                    )}
                  />
                )}
              </FormField>

              <FormField id="field-collectionId" label="Collection" error={errors.collectionId?.message}>
                {(control) => (
                  <Controller
                    control={form.control}
                    name="collectionId"
                    render={({ field }) => (
                      <RelationCombobox
                        control={control}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        options={toItems(options.data?.collections ?? [])}
                        placeholder={options.isPending ? "Loading collections…" : "No collection"}
                        emptyText={(options.data?.collections ?? []).length === 0 ? "No collections yet. Create one under Collections." : "No matching collections."}
                        disabled={busy || options.isPending}
                        fallbackLabel={baseline?.collection?.id === field.value ? baseline.collection.name : undefined}
                      />
                    )}
                  />
                )}
              </FormField>
            </div>
          </FormSection>

          {/* ------------------------------------------------- label */}
          <FormSection title="Storefront label" description="Optional badge on the product card, such as “New” or “Sale”.">
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <FormField id="field-label" label="Label" error={errors.label?.message} counter={`${label.trim().length} / ${PRODUCT_RULES.labelMax}`}>
                {(control) => <Input {...control} {...form.register("label")} autoComplete="off" maxLength={PRODUCT_RULES.labelMax + 8} placeholder="e.g. New" />}
              </FormField>
              <ColorField form={form} name="labelColor" label="Text colour" disabled={!label.trim() || busy} error={errors.labelColor?.message} />
              <ColorField form={form} name="labelBg" label="Background" disabled={!label.trim() || busy} error={errors.labelBg?.message} />
            </div>
            {label.trim() ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Preview
                <ProductLabelBadge
                  label={label.trim()}
                  color={HEX_COLOR_PATTERN.test(labelColor) ? labelColor : null}
                  background={HEX_COLOR_PATTERN.test(labelBg) ? labelBg : null}
                />
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Add label text to choose its colours. Without a label, no badge is shown.</p>
            )}
          </FormSection>

          {/* ---------------------------------------------- variants */}
          <section id="section-variants" className="min-w-0 border border-border bg-background" aria-labelledby="section-variants-heading">
            <header className="border-b border-border px-5 py-4">
              <h2 id="section-variants-heading" className="text-sm font-semibold">
                Variants
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Each size and colour combination, with its own stock and barcode. Saved together with the product.
              </p>
            </header>
            <div className="p-4 sm:p-5">
              <VariantEditor
                form={form}
                baseVariants={baseVariants}
                rowErrors={rowErrors}
                onRowChange={controller.clearRowError}
                preOrdersDisabled={options.data?.preOrdersDisabled === true}
                disabled={busy}
              />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ side panels */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <FormSection title="Visibility">
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <label htmlFor="field-isActive" className="text-sm font-medium">
                      Visible on storefront
                    </label>
                    <p id="field-isActive-description" className="text-xs leading-relaxed text-muted-foreground">
                      {field.value
                        ? "Customers can see this product."
                        : isEdit && baseline?.isActive
                          ? "Saving hides it and removes it from customers' carts and favorites."
                          : "Hidden from customers. You can show it later."}
                    </p>
                  </div>
                  <Switch
                    id="field-isActive"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-describedby="field-isActive-description"
                    inputRef={field.ref}
                    disabled={busy}
                  />
                </div>
              )}
            />
          </FormSection>

          <FormSection title="Cover image" description="Optional. The main photo on product cards.">
            <ImageControl form={form} name="coverImage" label="Cover image" disabled={busy} />
          </FormSection>

          <FormSection title="Size table" description="Optional. A size chart image shown on the product page.">
            <ImageControl form={form} name="sizeTableImage" label="Size table image" disabled={busy} />
          </FormSection>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85 lg:left-64">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <p className={cn("min-w-0 truncate text-xs text-muted-foreground", !busy && "hidden sm:block")} aria-live="polite">
            {busy ? (
              <span className="flex items-center gap-2 text-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {phaseLabel[phase]}
              </span>
            ) : isDirty ? (
              "Unsaved changes"
            ) : isEdit ? (
              "No changes yet"
            ) : (
              <span>
                Fields marked <span className="text-destructive">*</span> are required
              </span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={returnTo} className={buttonVariants({ variant: "outline" })} aria-disabled={busy || undefined}>
              Cancel
            </Link>
            <Button type="submit" disabled={busy || (isEdit && !isDirty && !uncertain)} aria-busy={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {busy ? (phase === "uploading" ? "Uploading…" : "Saving…") : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function countVariantErrors(errors: FieldErrors<ProductFormValues>): number {
  const list = errors.variants;
  if (!Array.isArray(list)) return 0;
  return list.reduce((total: number, row) => total + (row ? Object.keys(row).length : 0), 0);
}

/* ------------------------------------------------------------ controls */

function ColorField({
  form,
  name,
  label,
  disabled,
  error,
}: {
  form: ProductFormController["form"];
  name: "labelColor" | "labelBg";
  label: string;
  disabled: boolean;
  error?: string;
}) {
  return (
    <FormField id={`field-${name}`} label={label} error={error}>
      {(control) => (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <div className="flex gap-2">
              <input
                type="color"
                aria-label={`${label} picker`}
                value={HEX_COLOR_PATTERN.test(field.value) ? field.value.toLowerCase() : name === "labelBg" ? "#000000" : "#ffffff"}
                onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                disabled={disabled}
                className="h-9 w-11 shrink-0 cursor-pointer border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Input
                {...control}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                placeholder="None"
                className="font-mono uppercase"
              />
            </div>
          )}
        />
      )}
    </FormField>
  );
}

function ImageControl({
  form,
  name,
  label,
  disabled,
}: {
  form: ProductFormController["form"];
  name: "coverImage" | "sizeTableImage";
  label: string;
  disabled: boolean;
}) {
  return (
    <FormField id={`field-${name}`} label={label} error={form.formState.errors[name]?.message} className="[&>div:first-child]:sr-only">
      {(control) => (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <ImageField
              control={control}
              label={label}
              value={field.value}
              disabled={disabled}
              onChange={(value) => {
                form.clearErrors(name);
                field.onChange(value);
              }}
              onReject={(message) => form.setError(name, { type: "manual", message })}
            />
          )}
        />
      )}
    </FormField>
  );
}

/* --------------------------------------------------------- notice banner */

function NoticeBanner({ controller, returnTo }: { controller: ProductFormController; returnTo: string }) {
  const { notice, busy } = controller;
  if (!notice) return null;

  const tone = notice.kind === "uncertain" || notice.kind === "stale" ? "warning" : "error";
  const Icon = notice.kind === "forbidden" ? ShieldAlert : notice.kind === "gone" ? Trash2 : AlertTriangle;

  let title: string;
  let body: string;
  let actions: ReactNode = null;

  switch (notice.kind) {
    case "uncertain":
      title = "Saving couldn't be confirmed";
      body = notice.message;
      actions = (
        <Button type="submit" size="sm" disabled={busy}>
          <RefreshCw aria-hidden />
          Check &amp; retry
        </Button>
      );
      break;
    case "stale":
      title = "This product was changed by someone else";
      body =
        "It was updated after you opened this form. Load the latest version (your edits will be discarded), or save yours over it — only the fields you changed are written.";
      actions = (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => void controller.loadLatest()} disabled={busy}>
            <RotateCcw aria-hidden />
            Load latest version
          </Button>
          <Button type="button" size="sm" onClick={controller.overwrite} disabled={busy}>
            Save mine anyway
          </Button>
        </>
      );
      break;
    case "gone":
      title = "This product no longer exists";
      body = `${notice.message} Your changes can't be saved.`;
      actions = (
        <Link href={returnTo} className={buttonVariants({ size: "sm", variant: "outline" })}>
          Back
        </Link>
      );
      break;
    case "forbidden":
      title = "You can't save this";
      body = notice.message;
      break;
    default:
      title = "Your changes weren't saved";
      body = `${notice.message} Your entries are still here.`;
      actions = (
        <Button type="submit" size="sm" disabled={busy}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
      );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 border px-4 py-3 text-sm sm:flex-row sm:items-start",
        tone === "warning" ? "border-amber-500/40 bg-amber-500/5" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-amber-600" : "text-destructive")} aria-hidden />
      <div className="grid flex-1 gap-1">
        <p className="font-medium">{title}</p>
        <p className="leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
