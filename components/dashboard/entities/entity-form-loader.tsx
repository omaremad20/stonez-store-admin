"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { buttonVariants } from "@/components/ui/button";
import { EntityForm } from "@/components/dashboard/entities/entity-form";
import { EntityErrorState } from "@/components/dashboard/entities/entity-states";
import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { fetchEntityRecord } from "@/lib/entities/form-client";
import { entityKeys } from "@/lib/entities/hooks";
import { cn } from "@/lib/utils";

/** Skeleton mirroring the form layout (details + side panels + action bar). */
export function EntityFormSkeleton({ withDepartment = false }: { withDepartment?: boolean }) {
  const block = "animate-pulse bg-muted";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true" aria-label="Loading form">
      <div className="border border-border">
        <div className="border-b border-border px-5 py-4">
          <div className={cn(block, "h-3.5 w-20")} />
          <div className={cn(block, "mt-2 h-2.5 w-56 bg-muted/70")} />
        </div>
        <div className="grid gap-6 p-5">
          {[...Array(withDepartment ? 3 : 2)].map((_, index) => (
            <div key={index} className="grid gap-2">
              <div className={cn(block, "h-3 w-24")} />
              <div className={cn(block, index === (withDepartment ? 2 : 1) ? "h-28" : "h-9", "w-full")} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-6">
        <div className="border border-border p-5">
          <div className={cn(block, "h-3.5 w-20")} />
          <div className="mt-5 flex items-center justify-between">
            <div className={cn(block, "h-3 w-32")} />
            <div className={cn(block, "h-6 w-11 rounded-full")} />
          </div>
        </div>
        <div className="border border-border p-5">
          <div className={cn(block, "h-3.5 w-16")} />
          <div className={cn(block, "mt-5 aspect-[4/3] w-full")} />
        </div>
      </div>
    </div>
  );
}

export function EntityCreateForm({ entity, returnTo }: { entity: EntityKey; returnTo: string }) {
  return <EntityForm entity={entity} mode={{ kind: "create" }} returnTo={returnTo} />;
}

/**
 * Loads the record, then mounts the form exactly once with it. The form is
 * never rendered with placeholder defaults, and background refetches can't
 * reset fields the user is editing.
 */
export function EntityEditForm(props: { entity: EntityKey; id: string; returnTo: string }) {
  // A fresh navigation to the edit page (link, router.push) remounts the loader so
  // the record is fetched again; Back/Forward keeps the preserved form instead.
  const { bfcacheId } = useRouter();
  return <EditFormLoader key={bfcacheId} {...props} />;
}

function EditFormLoader({ entity, id, returnTo }: { entity: EntityKey; id: string; returnTo: string }) {
  const config = ENTITY_CONFIG[entity];
  const record = useQuery({
    queryKey: entityKeys.record(entity, id),
    queryFn: () => fetchEntityRecord(entity, id),
    // Always load a fresh copy for editing (its updated_at is the concurrency
    // token), then never refetch underneath the form.
    refetchOnMount: "always",
    staleTime: Infinity,
    retry: (failureCount, error) => !(error instanceof EntityRequestError && error.isPermanent) && failureCount < 2,
  });

  if (record.isError) {
    const error = toEntityError(record.error);
    if (error.code === "not_found") {
      return (
        <div className="flex flex-col items-start gap-4 border border-dashed border-border px-6 py-14 sm:items-center sm:text-center">
          <div className="grid max-w-md gap-1.5">
            <h2 className="text-base font-semibold">This {config.singular.toLowerCase()} doesn&apos;t exist</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              It may have been deleted, or the link is wrong.
            </p>
          </div>
          <Link href={returnTo} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Back to {config.plural.toLowerCase()}
          </Link>
        </div>
      );
    }
    return (
      <EntityErrorState
        message={error.message}
        canRetry={!error.isPermanent}
        isRetrying={record.isFetching}
        onRetry={() => void record.refetch()}
      />
    );
  }

  if (!record.data || !record.isFetchedAfterMount) {
    return <EntityFormSkeleton withDepartment={config.departmentScope} />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <p className="truncate text-sm text-muted-foreground">
        Editing <span className="font-medium text-foreground">“{record.data.name}”</span>
      </p>
      <EntityForm key={record.data.id} entity={entity} mode={{ kind: "edit", record: record.data }} returnTo={returnTo} />
    </div>
  );
}
