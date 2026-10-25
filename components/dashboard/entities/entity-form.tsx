"use client";

import Link from "next/link";
import { Controller, useWatch } from "react-hook-form";
import { AlertTriangle, CircleAlert, CircleCheck, Loader2, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormSection } from "@/components/dashboard/entities/form-field";
import { ImageField } from "@/components/dashboard/entities/image-field";
import type { EntityKey } from "@/lib/entities/config";
import { previewSlug } from "@/lib/entities/form-schema";
import { useDepartmentOptions } from "@/lib/entities/hooks";
import { useEntityForm, type EntityFormController, type FormMode } from "@/lib/entities/use-entity-form";
import { cn } from "@/lib/utils";

const NO_DEPARTMENT = "__none__";

type Props = { entity: EntityKey; mode: FormMode; returnTo: string };

/**
 * Shared create / edit form for departments, brands, categories and
 * collections. Field set and limits come from ENTITY_FORM_RULES.
 */
export function EntityForm({ entity, mode, returnTo }: Props) {
  const controller = useEntityForm({ entity, mode, returnTo });
  const { form, rules, config, phase, busy, isDirty, uncertain } = controller;
  const { errors, submitCount } = form.formState;
  const singular = config.singular.toLowerCase();

  const departments = useDepartmentOptions();
  const departmentsBlocking = rules.hasDepartment && (departments.isPending || departments.isError);

  const name = useWatch({ control: form.control, name: "name" });
  const description = useWatch({ control: form.control, name: "description" });

  const isEdit = mode.kind === "edit";
  const submitLabel = uncertain
    ? "Check & retry"
    : isEdit
      ? "Save changes"
      : `Create ${singular}`;
  const phaseLabel: Record<typeof phase, string> = {
    idle: "",
    uploading: "Uploading image…",
    saving: isEdit ? "Saving changes…" : `Creating ${singular}…`,
    verifying: "Checking what was saved…",
  };
  const fieldErrorCount = Object.keys(errors).length;

  return (
    <form onSubmit={controller.submit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-24" aria-busy={busy}>
      <FormNoticeBanner controller={controller} returnTo={returnTo} singular={singular} />

      {submitCount > 0 && fieldErrorCount > 0 && !busy && (
        <div role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {fieldErrorCount === 1 ? "1 field needs attention" : `${fieldErrorCount} fields need attention`}
          </p>
          <ul className="mt-2 grid gap-1 pl-6 text-destructive">
            {(["name", "departmentId", "description", "image"] as const)
              .filter((key) => errors[key]?.message)
              .map((key) => (
                <li key={key}>
                  <a href={`#field-${key}`} className="underline underline-offset-2 hover:no-underline">
                    {FIELD_LABELS[key]}
                  </a>
                  : {errors[key]?.message}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FormSection title="Details" description={`How this ${singular} is named and described in the store.`}>
          <FormField
            id="field-name"
            label="Name"
            required
            error={errors.name?.message}
            counter={`${name.trim().length} / ${rules.nameMax}`}
            description={
              rules.uniqueName ? `Must be unique — no two ${config.plural.toLowerCase()} can share a name (case-insensitive).` : undefined
            }
            status={<NameStatus controller={controller} name={name} />}
          >
            {(control) => (
              <Input
                {...control}
                {...form.register("name")}
                autoComplete="off"
                maxLength={rules.nameMax + 16 /* allow typing past the limit so the error is visible */}
                placeholder={NAME_PLACEHOLDERS[entity]}
              />
            )}
          </FormField>

          {rules.hasDepartment && (
            <FormField
              id="field-departmentId"
              label="Department"
              error={errors.departmentId?.message ?? (departments.isError ? "Departments couldn't be loaded." : undefined)}
              description="Categories are listed and ordered within their department. Moving a category places it at the end of its new department."
              status={
                departments.isError ? (
                  <Button type="button" variant="outline" size="xs" onClick={() => void departments.refetch()}>
                    <RotateCcw aria-hidden />
                    Retry loading departments
                  </Button>
                ) : departments.data?.truncated ? (
                  "Showing the first 24 departments."
                ) : undefined
              }
            >
              {(control) => (
                <Controller
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => {
                    const options = departments.data?.items ?? [];
                    const items: Record<string, string> = { [NO_DEPARTMENT]: "No department" };
                    for (const option of options) items[option.id] = option.name;
                    // Keep a valid current value visible even if it's beyond the loaded options.
                    if (field.value && !items[field.value]) items[field.value] = "Current department";
                    return (
                      <Select
                        items={items}
                        value={field.value || NO_DEPARTMENT}
                        onValueChange={(next) => field.onChange(typeof next === "string" && next !== NO_DEPARTMENT ? next : "")}
                        disabled={departments.isPending || departments.isError}
                      >
                        <SelectTrigger
                          ref={field.ref}
                          id={control.id}
                          aria-describedby={control["aria-describedby"]}
                          aria-invalid={control["aria-invalid"]}
                          onBlur={field.onBlur}
                          className="w-full"
                        >
                          {departments.isPending ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              Loading departments…
                            </span>
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                          <SelectSeparator />
                          {Object.entries(items)
                            .filter(([value]) => value !== NO_DEPARTMENT)
                            .map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              )}
            </FormField>
          )}

          <FormField
            id="field-description"
            label="Description"
            error={errors.description?.message}
            counter={rules.descriptionMax ? `${description.trim().length} / ${rules.descriptionMax}` : undefined}
            description={
              rules.descriptionMax
                ? `Between 2 and ${rules.descriptionMax} characters, or leave it empty.`
                : "At least 2 characters, or leave it empty."
            }
          >
            {(control) => <Textarea {...control} {...form.register("description")} rows={5} placeholder={`A short description of this ${singular}…`} />}
          </FormField>
        </FormSection>

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
                        ? `Customers can see this ${singular}.`
                        : `Hidden from customers. You can show it later.`}
                    </p>
                  </div>
                  <Switch
                    id="field-isActive"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-describedby="field-isActive-description"
                    inputRef={field.ref}
                  />
                </div>
              )}
            />
          </FormSection>

          <FormSection title="Image" description="Optional. Shown wherever this appears in the store.">
            <FormField id="field-image" label="Image" error={errors.image?.message} className="[&>div:first-child]:sr-only">
              {(control) => (
                <Controller
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <ImageField
                      control={control}
                      label={`${config.singular} image`}
                      value={field.value}
                      onChange={(value) => {
                        form.clearErrors("image");
                        field.onChange(value);
                      }}
                      onReject={(message) => form.setError("image", { type: "manual", message })}
                    />
                  )}
                />
              )}
            </FormField>
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
            <Button type="submit" disabled={busy || departmentsBlocking || (isEdit && !isDirty && !uncertain)} aria-busy={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {busy ? (phase === "uploading" ? "Uploading…" : "Saving…") : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

const FIELD_LABELS = { name: "Name", departmentId: "Department", description: "Description", image: "Image" } as const;

const NAME_PLACEHOLDERS: Record<EntityKey, string> = {
  departments: "e.g. Women's Clothing",
  brands: "e.g. Levi's",
  categories: "e.g. Denim Jackets",
  collections: "e.g. Summer 2026",
};

/* ----------------------------------------------------------- name status */

function NameStatus({ controller, name }: { controller: EntityFormController; name: string }) {
  const { rules, nameCheck, baseline } = controller;
  const slug = rules.hasSlug ? previewSlug(name) : "";
  const parts: React.ReactNode[] = [];

  if (rules.hasSlug && slug.length >= 2) {
    const unchanged = baseline?.slug && baseline.name.trim().toLowerCase() === name.trim().toLowerCase();
    parts.push(
      <span key="slug" className="font-mono">
        <span className="font-sans">Slug: </span>
        {unchanged ? baseline!.slug : slug}
        {!unchanged && <span className="font-sans"> — generated from the name; a number is added if it&apos;s already taken</span>}
      </span>,
    );
  }

  if (nameCheck.enabled) {
    if (nameCheck.checking) {
      parts.push(
        <span key="check" className="flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Checking name…
        </span>,
      );
    } else if (nameCheck.taken) {
      parts.push(
        <span key="check" className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" aria-hidden />
          This name is already used by another {controller.config.singular.toLowerCase()}.
        </span>,
      );
    } else if (nameCheck.available) {
      parts.push(
        <span key="check" className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-3" aria-hidden />
          Name is available
        </span>,
      );
    }
  }
  return parts.length ? <span className="grid gap-1">{parts}</span> : null;
}

/* --------------------------------------------------------- notice banner */

function FormNoticeBanner({ controller, returnTo, singular }: { controller: EntityFormController; returnTo: string; singular: string }) {
  const { notice, busy } = controller;
  if (!notice) return null;

  const tone = notice.kind === "uncertain" || notice.kind === "stale" ? "warning" : "error";
  const Icon = notice.kind === "forbidden" ? ShieldAlert : notice.kind === "gone" ? Trash2 : AlertTriangle;

  let title: string;
  let body: string;
  let actions: React.ReactNode = null;

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
      title = `This ${singular} was changed by someone else`;
      body = "It was updated after you opened this form. Load the latest version (your edits will be discarded), or save yours over it.";
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
      title = `This ${singular} no longer exists`;
      body = `${notice.message} Your changes can't be saved.`;
      actions = (
        <Link href={returnTo} className={buttonVariants({ size: "sm", variant: "outline" })}>
          Back to list
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
