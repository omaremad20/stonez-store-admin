import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  /** Persistent helper text under the label. */
  description?: ReactNode;
  /** Live, non-error status (e.g. "Checking name…"). */
  status?: ReactNode;
  error?: string;
  /** Right-aligned counter, e.g. "12 / 32". */
  counter?: ReactNode;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * Label + control + description + error with correct ARIA wiring. Every
 * entity form field goes through this so spacing and semantics stay identical.
 */
export function FormField({ id, label, required, description, status, error, counter, className, children }: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const statusId = status ? `${id}-status` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, descriptionId, statusId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {required ? (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          ) : (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {counter && <span className="text-xs text-muted-foreground tabular-nums">{counter}</span>}
      </div>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {status && (
        <div id={statusId} aria-live="polite" className="text-xs text-muted-foreground">
          {status}
        </div>
      )}
      {description && (
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/** Bordered section used to group form fields. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={cn("min-w-0 border border-border bg-background", className)} aria-labelledby={headingId}>
      <header className="border-b border-border px-5 py-4">
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-4 sm:p-5">{children}</div>
    </section>
  );
}
