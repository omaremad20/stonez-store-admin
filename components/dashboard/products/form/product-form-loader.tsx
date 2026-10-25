"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { EntityErrorState } from "@/components/dashboard/entities/entity-states";
import { ProductForm } from "@/components/dashboard/products/form/product-form";
import { ProductFormSkeleton, ProductNotFound } from "@/components/dashboard/products/product-states";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { fetchProduct } from "@/lib/products/client";
import { productKeys } from "@/lib/products/hooks";

export function ProductCreateForm({ returnTo }: { returnTo: string }) {
  return <ProductForm mode={{ kind: "create" }} returnTo={returnTo} />;
}

/**
 * Loads the product, then mounts the form exactly once with it. The form is
 * never rendered with placeholder defaults, and background refetches can't
 * reset fields the user is editing.
 */
export function ProductEditForm(props: { id: string; returnTo: string }) {
  // A fresh navigation (link, router.push) remounts the loader so the product
  // is fetched again; Back/Forward keeps the preserved form instead.
  const { bfcacheId } = useRouter();
  return <EditFormLoader key={bfcacheId} {...props} />;
}

function EditFormLoader({ id, returnTo }: { id: string; returnTo: string }) {
  const product = useQuery({
    queryKey: productKeys.editable(id),
    queryFn: ({ signal }) => fetchProduct(id, signal),
    // Always a fresh copy for editing (updated_at is the concurrency token).
    refetchOnMount: "always",
    staleTime: Infinity,
    retry: (failureCount, error) => !(error instanceof EntityRequestError && error.isPermanent) && failureCount < 2,
  });

  if (product.isError) {
    const error = toEntityError(product.error);
    if (error.code === "not_found") return <ProductNotFound backHref={returnTo} />;
    return (
      <EntityErrorState
        message={error.message}
        canRetry={!error.isPermanent}
        isRetrying={product.isFetching}
        onRetry={() => void product.refetch()}
      />
    );
  }

  if (!product.data || !product.isFetchedAfterMount) return <ProductFormSkeleton />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <p className="truncate text-sm text-muted-foreground">
        Editing <span className="font-medium text-foreground">“{product.data.name}”</span>
      </p>
      <ProductForm key={product.data.id} mode={{ kind: "edit", product: product.data }} returnTo={returnTo} />
    </div>
  );
}
