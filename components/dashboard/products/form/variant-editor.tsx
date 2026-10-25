"use client";

import { memo } from "react";
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { CircleAlert, Copy, Lock, Plus, ShoppingCart, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/dashboard/entities/form-field";
import { ImageField } from "@/components/dashboard/entities/image-field";
import { HEX_COLOR_PATTERN, VARIANT_RULES } from "@/lib/products/constants";
import type { ProductFormValues, VariantFormValue } from "@/lib/products/form-schema";
import type { ProductVariant } from "@/lib/products/types";
import { duplicateVariantKeys, newVariant } from "@/lib/products/use-product-form";
import { cn } from "@/lib/utils";

type Props = {
  form: UseFormReturn<ProductFormValues>;
  /** Loaded variants (edit mode): barcode, printed / cart lock state. */
  baseVariants: Map<string, ProductVariant>;
  rowErrors: Record<string, string>;
  onRowChange: (key: string) => void;
  preOrdersDisabled: boolean;
  disabled: boolean;
};

const LOCK_COPY = {
  printed: "Label printed",
  in_cart: "In a cart",
  printed_and_in_cart: "Printed · in a cart",
} as const;

/**
 * Variants edited inside the product form. Existing variants keep their ids;
 * new ones get a client id; removing an existing variant only marks it for
 * deletion on save (restorable). Printed / in-cart variants follow the
 * database rules: size and colour are read-only and they can't be removed —
 * hide them instead.
 */
export function VariantEditor({ form, baseVariants, rowErrors, onRowChange, preOrdersDisabled, disabled }: Props) {
  const { fields, append, remove, insert, update } = useFieldArray({ control: form.control, name: "variants", keyName: "_rhfKey" });
  const variants = useWatch({ control: form.control, name: "variants" });
  const duplicates = duplicateVariantKeys(variants ?? []);
  const active = (variants ?? []).filter((variant) => !variant.removed).length;
  const arrayError = form.formState.errors.variants?.root?.message ?? form.formState.errors.variants?.message;

  return (
    <div className="grid gap-4">
      {preOrdersDisabled && (
        <p className="flex items-start gap-2 border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Pre-orders are turned off store-wide in Store Settings, so customers can only buy what&apos;s in stock. Variant pre-order settings are kept for when it&apos;s turned back on.
        </p>
      )}

      {fields.length === 0 || active === 0 ? (
        <div className="flex flex-col items-start gap-2 border border-dashed border-border px-4 py-6 text-sm sm:items-center sm:text-center">
          <p className="font-medium">No variants</p>
          <p className="text-muted-foreground">
            Customers can only add a product to their cart through a variant. Add at least one size and colour.
          </p>
        </div>
      ) : null}

      <ol className="grid gap-3">
        {fields.map((field, index) => (
          <VariantRow
            key={field._rhfKey}
            index={index}
            control={form.control}
            errors={form.formState.errors}
            base={field.isNew ? undefined : baseVariants.get(field.id)}
            duplicate={duplicates.has(field.key)}
            rowError={rowErrors[field.key]}
            preOrdersDisabled={preOrdersDisabled}
            disabled={disabled}
            onChange={() => onRowChange(field.key)}
            onRemove={() => {
              onRowChange(field.key);
              const current = form.getValues(`variants.${index}`);
              if (current.isNew) remove(index);
              else update(index, { ...current, removed: true });
            }}
            onRestore={() => {
              onRowChange(field.key);
              update(index, { ...form.getValues(`variants.${index}`), removed: false });
            }}
            onImageError={(message) =>
              message ? form.setError(`variants.${index}.image`, { type: "manual", message }) : form.clearErrors(`variants.${index}.image`)
            }
            onDuplicate={() => {
              const current = form.getValues(`variants.${index}`);
              insert(
                index + 1,
                newVariant({
                  colorHash: current.colorHash,
                  colorName: current.colorName,
                  stock: current.stock,
                  preorderEnabled: current.preorderEnabled,
                  maxPreorder: current.maxPreorder,
                  isActive: current.isActive,
                }),
                { shouldFocus: false },
              );
              // Focus the new row's size (the field to change on a copy).
              window.setTimeout(() => form.setFocus(`variants.${index + 1}.size`), 0);
            }}
          />
        ))}
      </ol>

      {arrayError && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {arrayError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            append(newVariant(), { shouldFocus: false });
            window.setTimeout(() => form.setFocus(`variants.${fields.length}.size`), 0);
          }}
          disabled={disabled || fields.length >= VARIANT_RULES.maxVariantsPerSave}
        >
          <Plus aria-hidden />
          Add variant
        </Button>
        <p className="text-xs text-muted-foreground">
          {active} {active === 1 ? "variant" : "variants"}
          {fields.length !== active ? ` · ${fields.length - active} to delete on save` : ""}
        </p>
      </div>
    </div>
  );
}

type RowProps = {
  index: number;
  control: Control<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  base: ProductVariant | undefined;
  duplicate: boolean;
  rowError: string | undefined;
  preOrdersDisabled: boolean;
  disabled: boolean;
  onChange: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onDuplicate: () => void;
  onImageError: (message: string | null) => void;
};

const VariantRow = memo(function VariantRow({
  index,
  control,
  errors,
  base,
  duplicate,
  rowError,
  preOrdersDisabled,
  disabled,
  onChange,
  onRemove,
  onRestore,
  onDuplicate,
  onImageError,
}: RowProps) {
  const value = useWatch({ control, name: `variants.${index}` }) as VariantFormValue | undefined;
  if (!value) return null;

  const fieldErrors = errors.variants?.[index];
  const locked = base?.lockReason ?? null;
  const idBase = `variant-${value.key}`;
  const label = `Variant ${index + 1}`;

  if (value.removed) {
    return (
      <li className="flex flex-col gap-3 border border-dashed border-destructive/40 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
        <span className="flex-1">
          <span className="font-medium line-through">
            {base?.size ?? value.size} · {base?.colorName ?? value.colorName}
          </span>
          <span className="ml-2 text-muted-foreground">will be deleted when you save.</span>
          {rowError && (
            <span role="alert" className="mt-1 flex items-start gap-1.5 text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {rowError}
            </span>
          )}
        </span>
        <Button type="button" variant="outline" size="xs" onClick={onRestore} disabled={disabled}>
          <Undo2 aria-hidden />
          Restore
        </Button>
      </li>
    );
  }

  return (
    <li className={cn("grid gap-4 border border-border bg-background p-4", (rowError || duplicate) && "border-destructive/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        {base ? (
          <span className="font-mono text-xs text-muted-foreground tabular-nums" title="Barcode (generated by the store)">
            {base.barcode}
          </span>
        ) : (
          <span className="border border-dashed border-border px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
            New · barcode on save
          </span>
        )}
        {locked && (
          <span
            className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground"
            title="Size, colour and barcode are locked. The variant can be hidden but not deleted."
          >
            {locked === "in_cart" ? <ShoppingCart className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
            {LOCK_COPY[locked]}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onDuplicate} disabled={disabled} aria-label={`Duplicate ${label}`}>
            <Copy aria-hidden />
            <span className="hidden sm:inline">Duplicate</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="hover:text-destructive"
            onClick={onRemove}
            disabled={disabled || locked !== null}
            title={locked ? "Printed or in a cart — hide it instead of deleting" : undefined}
            aria-label={`Remove ${label}`}
          >
            <Trash2 aria-hidden />
            <span className="hidden sm:inline">Remove</span>
          </Button>
        </span>
      </div>

      {(rowError || duplicate) && (
        <p role="alert" className="-mt-1 flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {rowError ?? "Another variant already has this size and colour."}
        </p>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <FormField id={`${idBase}-size`} label="Size" required error={fieldErrors?.size?.message}>
          {(aria) => (
            <Controller
              control={control}
              name={`variants.${index}.size`}
              render={({ field }) => (
                <Input
                  {...aria}
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    onChange();
                  }}
                  disabled={disabled || locked !== null}
                  autoComplete="off"
                  maxLength={VARIANT_RULES.sizeMax + 8}
                  placeholder="e.g. M or 42"
                  className="uppercase"
                />
              )}
            />
          )}
        </FormField>

        <FormField id={`${idBase}-colorHash`} label="Colour" required error={fieldErrors?.colorHash?.message}>
          {(aria) => (
            <Controller
              control={control}
              name={`variants.${index}.colorHash`}
              render={({ field }) => (
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={`${label} colour picker`}
                    value={HEX_COLOR_PATTERN.test(field.value) ? field.value.toLowerCase() : "#000000"}
                    onChange={(event) => {
                      field.onChange(event.target.value.toUpperCase());
                      onChange();
                    }}
                    disabled={disabled || locked !== null}
                    className="h-9 w-11 shrink-0 cursor-pointer border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Input
                    {...aria}
                    value={field.value}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      onChange();
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    name={field.name}
                    disabled={disabled || locked !== null}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                    placeholder="#1A2B3C"
                    className="font-mono uppercase"
                  />
                </div>
              )}
            />
          )}
        </FormField>

        <FormField id={`${idBase}-colorName`} label="Colour name" required error={fieldErrors?.colorName?.message}>
          {(aria) => (
            <Controller
              control={control}
              name={`variants.${index}.colorName`}
              render={({ field }) => (
                <Input
                  {...aria}
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    onChange();
                  }}
                  disabled={disabled || locked !== null}
                  autoComplete="off"
                  maxLength={VARIANT_RULES.colorNameMax + 8}
                  placeholder="e.g. Navy"
                />
              )}
            />
          )}
        </FormField>

        <FormField
          id={`${idBase}-stock`}
          label="Stock"
          required
          error={fieldErrors?.stock?.message}
          description={Number(value.stock) < 0 ? "Below zero: pre-ordered units waiting for stock." : undefined}
        >
          {(aria) => (
            <Controller
              control={control}
              name={`variants.${index}.stock`}
              render={({ field }) => (
                <Input
                  {...aria}
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    onChange();
                  }}
                  disabled={disabled}
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular-nums"
                />
              )}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-3">
          <Controller
            control={control}
            name={`variants.${index}.preorderEnabled`}
            render={({ field }) => (
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <label htmlFor={`${idBase}-preorder`} className="text-sm font-medium">
                    Accept pre-orders
                  </label>
                  <p className="text-xs text-muted-foreground">Allow orders beyond stock, up to a limit.</p>
                </div>
                <Switch
                  id={`${idBase}-preorder`}
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    onChange();
                  }}
                  inputRef={field.ref}
                  disabled={disabled}
                />
              </div>
            )}
          />
          {value.preorderEnabled && (
            <FormField id={`${idBase}-maxPreorder`} label="Maximum pre-order quantity" required error={fieldErrors?.maxPreorder?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name={`variants.${index}.maxPreorder`}
                  render={({ field }) => (
                    <Input
                      {...aria}
                      {...field}
                      onChange={(event) => {
                        field.onChange(event);
                        onChange();
                      }}
                      disabled={disabled}
                      inputMode="numeric"
                      autoComplete="off"
                      className="tabular-nums sm:max-w-40"
                    />
                  )}
                />
              )}
            </FormField>
          )}
          {!value.preorderEnabled && fieldErrors?.maxPreorder?.message && (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Maximum pre-order quantity: {fieldErrors.maxPreorder.message}
            </p>
          )}
          {preOrdersDisabled && value.preorderEnabled && (
            <p className="text-xs text-muted-foreground">Inactive while pre-orders are off store-wide.</p>
          )}
        </div>

        <Controller
          control={control}
          name={`variants.${index}.isActive`}
          render={({ field }) => (
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-0.5">
                <label htmlFor={`${idBase}-active`} className="text-sm font-medium">
                  Visible
                </label>
                <p className="text-xs text-muted-foreground">
                  {field.value ? "Customers can choose this variant." : "Hidden from customers (and removed from carts)."}
                </p>
              </div>
              <Switch
                id={`${idBase}-active`}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  onChange();
                }}
                inputRef={field.ref}
                disabled={disabled}
              />
            </div>
          )}
        />

        <FormField id={`${idBase}-image`} label="Image" error={fieldErrors?.image?.message}>
          {(aria) => (
            <Controller
              control={control}
              name={`variants.${index}.image`}
              render={({ field }) => (
                <ImageField
                  compact
                  control={aria}
                  label={`${label} image`}
                  value={field.value}
                  disabled={disabled}
                  onChange={(next) => {
                    onImageError(null);
                    field.onChange(next);
                    onChange();
                  }}
                  onReject={(message) => onImageError(message)}
                />
              )}
            />
          )}
        </FormField>
      </div>
    </li>
  );
});
