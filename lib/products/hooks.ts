"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { moveLoadedItem } from "@/lib/entities/hooks";
import type { ReorderPosition } from "@/lib/entities/types";
import {
  deleteProductRequest,
  fetchProduct,
  fetchProductOptions,
  fetchProductsPage,
  markVariantPrinted,
  reorderProduct,
  setProductVisibility,
} from "@/lib/products/client";
import type { ProductQueryState } from "@/lib/products/query-state";
import type { ProductDetail, ProductListItem, ProductListPage } from "@/lib/products/types";

type ListData = InfiniteData<ProductListPage, string | null>;

export const productKeys = {
  all: ["products"] as const,
  lists: () => ["products", "list"] as const,
  list: (state: ProductQueryState) => ["products", "list", state] as const,
  detail: (id: string) => ["products", "detail", id] as const,
  /** Edit-form copy: fetched fresh on mount, never refetched underneath the form. */
  editable: (id: string) => ["products", "editable", id] as const,
  options: () => ["products", "options"] as const,
};

const retryTransient = (failureCount: number, error: unknown) =>
  !(error instanceof EntityRequestError && error.isPermanent) && failureCount < 2;

/** Marks every products query stale; active ones refetch with their own state. */
export function invalidateProductQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: productKeys.all });
}

/* --------------------------------------------------------------- queries */

export function useProductList(state: ProductQueryState) {
  const query = useInfiniteQuery({
    queryKey: productKeys.list(state),
    queryFn: ({ pageParam, signal }) => fetchProductsPage(state, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Keep showing the previous result while a new search/filter loads.
    placeholderData: (previous) => previous,
    retry: retryTransient,
  });

  // Keyset paging never repeats a row, but de-duplicate defensively so a
  // concurrent reorder between batches can't render the same key twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: ProductListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }
    return result;
  }, [query.data]);

  return { ...query, items };
}

/** Brands / categories / collections / departments + pre-order switch. */
export function useProductOptions() {
  return useQuery({
    queryKey: productKeys.options(),
    queryFn: ({ signal }) => fetchProductOptions(signal),
    staleTime: 60_000,
    retry: retryTransient,
  });
}

export function useProductDetail(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: ({ signal }) => fetchProduct(id, signal),
    retry: retryTransient,
  });
}

/* ------------------------------------------------------------- mutations */

export type ProductReorderVariables = {
  id: string;
  targetId: string | null;
  position: ReorderPosition;
  listKey: QueryKey;
  /** Optimistic destination in the loaded list. */
  toIndex: number | "end-or-remove";
};

function patchLists(queryClient: QueryClient, fn: (items: ProductListItem[]) => ProductListItem[]) {
  queryClient.setQueriesData<ListData>({ queryKey: productKeys.lists() }, (data) =>
    data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) } : data,
  );
}

export function useProductMutations() {
  const queryClient = useQueryClient();

  const visibility = useMutation({
    mutationFn: ({ id, isActive }: { id: string; name: string; isActive: boolean }) => setProductVisibility(id, isActive),
    onSuccess: (result, { id, name }) => {
      // Patched only after the database confirmed the change.
      patchLists(queryClient, (items) =>
        items.map((item) => (item.id === id ? { ...item, isActive: result.isActive, updatedAt: result.updatedAt } : item)),
      );
      queryClient.setQueryData<ProductDetail>(productKeys.detail(id), (detail) =>
        detail ? { ...detail, isActive: result.isActive, updatedAt: result.updatedAt } : detail,
      );
      toast.success(result.isActive ? `“${name}” is now visible.` : `“${name}” is now hidden.`);
      invalidateProductQueries(queryClient);
    },
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteProductRequest(id),
    onSuccess: (result, { id, name }) => {
      patchLists(queryClient, (items) => items.filter((item) => item.id !== id));
      queryClient.removeQueries({ queryKey: productKeys.detail(id) });
      toast.success(`“${name}” was deleted.`, {
        description: result.imageCleanupFailed ? "Some images couldn't be removed from storage and will be cleaned up later." : undefined,
      });
      invalidateProductQueries(queryClient);
    },
  });

  const reorder = useMutation({
    // Serialised so rapid drags can't interleave (the RPC also takes an advisory lock).
    scope: { id: "reorder:products" },
    mutationFn: ({ id, targetId, position }: ProductReorderVariables) => reorderProduct({ id, targetId, position }),
    onMutate: async ({ id, toIndex, listKey }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ListData>(listKey);
      if (previous) queryClient.setQueryData<ListData>(listKey, moveLoadedItem(previous, id, toIndex));
      return { previous, listKey };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.listKey, context.previous);
      toast.error("The new order wasn't saved.", { description: toEntityError(error).message });
    },
    onSuccess: () => {
      toast.success("Order saved.");
    },
    onSettled: () => {
      // Re-sync display_order values and cursors with the database.
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ["products", "detail"] });
    },
  });

  return { visibility, remove, reorder };
}

/** Confirmed "the label printed" → mark_variant_as_printed. */
export function useMarkVariantPrinted(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId }: { variantId: string }) => markVariantPrinted(variantId),
    onSuccess: (result, { variantId }) => {
      queryClient.setQueryData<ProductDetail>(productKeys.detail(productId), (detail) =>
        detail
          ? {
              ...detail,
              variants: detail.variants.map((variant) =>
                variant.id === variantId
                  ? {
                      ...variant,
                      isPrinted: result.isPrinted,
                      updatedAt: result.updatedAt || variant.updatedAt,
                      lockReason: variant.cartLineCount > 0 ? "printed_and_in_cart" : "printed",
                    }
                  : variant,
              ),
            }
          : detail,
      );
      toast.success("Marked as printed. Its barcode, size and colour are now locked.");
      void queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    },
  });
}
