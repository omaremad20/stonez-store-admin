import type { ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, Loader2, Plus, RotateCcw, SearchX, ShieldAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { entityRoutes, type EntityConfig } from "@/lib/entities/config";
import { getNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------ skeleton */

const SKELETON_WIDTHS = ["w-40", "w-28", "w-48", "w-32", "w-36", "w-24", "w-44", "w-28"];

/** Mirrors the real table's layout so nothing jumps when data arrives. */
export function EntityTableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <div className="overflow-hidden border border-border" aria-busy="true" aria-label="Loading">
      <div className="flex h-10 items-center gap-6 border-b border-border bg-muted/40 px-4">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className={cn("h-2.5 animate-pulse bg-muted-foreground/15", index === 0 ? "w-24" : "w-16", index > 1 && "hidden md:block")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex h-15 items-center gap-6 border-b border-border px-4 last:border-b-0">
          <div className="size-8 shrink-0 animate-pulse bg-muted" />
          <div className="grid flex-1 gap-1.5">
            <div className={cn("h-3 animate-pulse bg-muted", SKELETON_WIDTHS[row % SKELETON_WIDTHS.length])} />
            <div className="h-2.5 w-20 animate-pulse bg-muted/70" />
          </div>
          <div className="hidden h-5 w-16 animate-pulse bg-muted md:block" />
          <div className="hidden h-3 w-24 animate-pulse bg-muted lg:block" />
          <div className="size-8 animate-pulse bg-muted" />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- frame */

function StatePanel({
  icon,
  title,
  description,
  action,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="flex flex-col items-start gap-4 border border-dashed border-border px-6 py-14 sm:items-center sm:text-center"
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center border",
          tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="grid max-w-md gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- empty */

export type EmptyKind = "no-records" | "no-search-results" | "no-filter-results";

export function EntityEmptyState({
  config,
  kind,
  query,
  onClearSearch,
  onClearFilters,
}: {
  config: EntityConfig;
  kind: EmptyKind;
  query: string;
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  const plural = config.plural.toLowerCase();
  const Icon = getNavItem(config.href)?.icon;

  if (kind === "no-search-results") {
    return (
      <StatePanel
        icon={<SearchX className="size-5" aria-hidden />}
        title={`No ${plural} match “${query}”`}
        description={`Check the spelling or search by a different name${config.hasSlug ? " or slug" : ""}.`}
        action={
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  }

  if (kind === "no-filter-results") {
    return (
      <StatePanel
        icon={<SearchX className="size-5" aria-hidden />}
        title={`No ${plural} match these filters`}
        description="Try a different visibility or department filter."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            <RotateCcw aria-hidden />
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <StatePanel
      icon={Icon ? <Icon className="size-5" aria-hidden /> : null}
      title={`No ${plural} yet`}
      description={`${config.plural} you add will appear here, in the order customers see them.`}
      action={
        <Link href={entityRoutes(config).create} className={buttonVariants({ size: "sm" })}>
          <Plus aria-hidden />
          New {config.singular}
        </Link>
      }
    />
  );
}

/* --------------------------------------------------------------- error */

export function EntityErrorState({
  message,
  onRetry,
  canRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  canRetry: boolean;
  isRetrying: boolean;
}) {
  return (
    <StatePanel
      tone="error"
      icon={<CircleAlert className="size-5" aria-hidden />}
      title="This list couldn't be loaded"
      description={message}
      action={
        canRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

export function EntityAccessRequired({ config }: { config: EntityConfig }) {
  return (
    <StatePanel
      icon={<ShieldAlert className="size-5" aria-hidden />}
      title="Administrator access required"
      description={`Only administrators can view and manage ${config.plural.toLowerCase()}. Ask the store administrator if you need access.`}
    />
  );
}
