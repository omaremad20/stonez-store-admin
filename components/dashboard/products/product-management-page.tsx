"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { PackageSearch, Plus, RotateCcw, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReorderRequest } from "@/components/dashboard/entities/entity-data-table";
import { InfiniteFooter, ReorderHint } from "@/components/dashboard/entities/entity-management-page";
import { EntityErrorState, EntityTableSkeleton } from "@/components/dashboard/entities/entity-states";
import { ProductBarcodeDialog } from "@/components/dashboard/products/barcode/product-barcode-dialog";
import { ProductCreateLink } from "@/components/dashboard/products/product-create-link";
import { ProductDataTable } from "@/components/dashboard/products/product-data-table";
import { ProductDeleteDialog } from "@/components/dashboard/products/product-delete-dialog";
import { ProductToolbar } from "@/components/dashboard/products/product-toolbar";
import { ProductVisibilityDialog } from "@/components/dashboard/products/product-visibility-dialog";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { PRODUCT_TABLE_COLUMN_COUNT } from "@/lib/products/constants";
import { productKeys, useProductList, useProductMutations } from "@/lib/products/hooks";
import {
  getProductReorderAvailability,
  hasActiveProductFilters,
  PRODUCT_DEFAULT_SORT_DIRECTION,
  type ProductSortKey,
} from "@/lib/products/query-state";
import type { ProductListItem } from "@/lib/products/types";
import { useProductQueryState } from "@/lib/products/use-product-query-state";

type DialogKind = "visibility" | "delete" | "barcode";
type DialogState = { kind: DialogKind; item: ProductListItem } | null;

/** /products: search, filters, sort, 25-row infinite scroll, drag-and-drop order and row actions. */
export function ProductManagementPage() {
  const { state, update, reset, listUrl } = useProductQueryState();
  const list = useProductList(state);
  const { visibility, remove, reorder } = useProductMutations();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Next keeps visited pages alive (Activity): close transient dialogs when
  // this page is hidden so they don't reappear on Back.
  useLayoutEffect(() => () => setDialogOpen(false), []);

  const availability = getProductReorderAvailability(state);
  const reorderEnabled = availability.enabled;
  // Handles lock while a save is in flight or the list is re-syncing positions.
  const reorderLocked = reorderEnabled && (reorder.isPending || (list.isFetching && !list.isFetchingNextPage));

  const openDialog = useCallback(
    (kind: DialogKind, item: ProductListItem) => {
      visibility.reset();
      remove.reset();
      setDialog({ kind, item });
      setDialogOpen(true);
    },
    [visibility, remove],
  );
  const onToggleVisibility = useCallback((item: ProductListItem) => openDialog("visibility", item), [openDialog]);
  const onDelete = useCallback((item: ProductListItem) => openDialog("delete", item), [openDialog]);
  const onBarcode = useCallback((item: ProductListItem) => openDialog("barcode", item), [openDialog]);

  const onReorder = (request: ReorderRequest) => {
    if (reorder.isPending) return;
    reorder.mutate({ ...request, listKey: productKeys.list(state) });
  };

  const onSort = useCallback(
    (sort: ProductSortKey) => {
      if (state.sort === sort) update({ dir: state.dir === "asc" ? "desc" : "asc" });
      else update({ sort, dir: PRODUCT_DEFAULT_SORT_DIRECTION[sort] });
    },
    [state.sort, state.dir, update],
  );

  const items = list.items;
  const error = list.error ? toEntityError(list.error) : null;
  const showBlockingError = list.isError && items.length === 0 && !list.isFetchNextPageError;

  let emptyKind: "no-records" | "no-search-results" | "no-filter-results" | null = null;
  if (!list.isPending && !list.isError && items.length === 0 && !list.isPlaceholderData) {
    emptyKind = state.q ? "no-search-results" : hasActiveProductFilters(state) ? "no-filter-results" : "no-records";
  }

  return (
    <div className="grid gap-4">
      <ProductToolbar state={state} onChange={update} onReset={reset} isUpdating={list.isFetching && !list.isFetchingNextPage} />

      <ReorderHint
        enabled={reorderEnabled}
        reason={availability.enabled ? null : availability.reason}
        saving={reorder.isPending}
        isManual={state.sort === "manual"}
        hasRows={items.length > 1}
        needsDepartment={false}
        onUseManual={() => update({ sort: "manual" })}
        onClearForManual={() => update({ q: "", status: "all", brand: null, category: null, collection: null, department: null })}
      />

      {list.isPending ? (
        <EntityTableSkeleton columns={PRODUCT_TABLE_COLUMN_COUNT} />
      ) : showBlockingError && error ? (
        <EntityErrorState
          message={error.message}
          canRetry={!(error instanceof EntityRequestError && error.isPermanent && error.code !== "conflict")}
          isRetrying={list.isFetching}
          onRetry={() => void list.refetch()}
        />
      ) : emptyKind ? (
        <ProductsEmptyState
          kind={emptyKind}
          query={state.q}
          onClearSearch={() => update({ q: "" })}
          onClearFilters={() => update({ status: "all", brand: null, category: null, collection: null, department: null })}
        />
      ) : (
        <>
          <ProductDataTable
            items={items}
            state={state}
            listUrl={listUrl}
            reorderEnabled={reorderEnabled}
            reorderLocked={reorderLocked}
            onReorder={onReorder}
            onSort={onSort}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete}
            onBarcode={onBarcode}
            dimmed={list.isPlaceholderData}
          />
          <InfiniteFooter
            plural="products"
            count={items.length}
            hasNextPage={list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            isNextPageError={list.isFetchNextPageError}
            errorMessage={list.isFetchNextPageError && error ? error.message : null}
            fetchNextPage={() => void list.fetchNextPage({ cancelRefetch: false })}
            paused={list.isPlaceholderData}
          />
        </>
      )}

      <ProductVisibilityDialog
        item={dialog?.kind === "visibility" ? dialog.item : null}
        open={dialogOpen && dialog?.kind === "visibility"}
        isPending={visibility.isPending}
        error={visibility.error ? toEntityError(visibility.error).message : null}
        onOpenChange={setDialogOpen}
        onConfirm={(item, nextActive) =>
          visibility.mutate({ id: item.id, name: item.name, isActive: nextActive }, { onSuccess: () => setDialogOpen(false) })
        }
      />
      <ProductDeleteDialog
        item={dialog?.kind === "delete" ? dialog.item : null}
        open={dialogOpen && dialog?.kind === "delete"}
        isPending={remove.isPending}
        error={remove.error ? toEntityError(remove.error).message : null}
        onOpenChange={setDialogOpen}
        onConfirm={(item) => remove.mutate({ id: item.id, name: item.name }, { onSuccess: () => setDialogOpen(false) })}
        onHideInstead={(item) => {
          const listed = items.find((candidate) => candidate.id === item.id);
          if (listed) openDialog("visibility", listed);
        }}
      />
      <ProductBarcodeDialog
        product={dialog?.kind === "barcode" ? dialog.item : null}
        open={dialogOpen && dialog?.kind === "barcode"}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function ProductsEmptyState({
  kind,
  query,
  onClearSearch,
  onClearFilters,
}: {
  kind: "no-records" | "no-search-results" | "no-filter-results";
  query: string;
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  const frame = "flex flex-col items-start gap-4 border border-dashed border-border px-6 py-14 sm:items-center sm:text-center";
  const icon = "flex size-11 items-center justify-center border border-border bg-muted/40 text-muted-foreground";

  if (kind === "no-search-results") {
    return (
      <div className={frame}>
        <span className={icon}>
          <SearchX className="size-5" aria-hidden />
        </span>
        <div className="grid max-w-md gap-1.5">
          <h2 className="text-base font-semibold">No products match “{query}”</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Check the spelling, or search by the full 10-digit barcode printed on the label.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }
  if (kind === "no-filter-results") {
    return (
      <div className={frame}>
        <span className={icon}>
          <SearchX className="size-5" aria-hidden />
        </span>
        <div className="grid max-w-md gap-1.5">
          <h2 className="text-base font-semibold">No products match these filters</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Try a different visibility, department, category, brand or collection.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          <RotateCcw aria-hidden />
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className={frame}>
      <span className={icon}>
        <PackageSearch className="size-5" aria-hidden />
      </span>
      <div className="grid max-w-md gap-1.5">
        <h2 className="text-base font-semibold">No products yet</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Products you add will appear here, in the order customers see them. Add sizes and colours as variants to sell them.
        </p>
      </div>
      <ProductCreateLink size="sm">
        <Plus aria-hidden />
        New Product
      </ProductCreateLink>
    </div>
  );
}
