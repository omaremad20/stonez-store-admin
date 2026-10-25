"use client";

import { memo, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ReorderRequest } from "@/components/dashboard/entities/entity-data-table";
import { restrictToVerticalAxis, usePrefersReducedMotion } from "@/components/dashboard/entities/entity-data-table";
import { StatusBadge } from "@/components/dashboard/entities/status-badge";
import { ProductLabelBadge } from "@/components/dashboard/products/product-label-badge";
import { ProductRowActions } from "@/components/dashboard/products/product-row-actions";
import { productRoutes } from "@/lib/products/constants";
import { discountedPrice, formatCount, formatDate, formatPrice, initials } from "@/lib/products/format";
import type { ProductQueryState, ProductSortKey } from "@/lib/products/query-state";
import type { ProductListItem, RelationRef } from "@/lib/products/types";
import { cn } from "@/lib/utils";

type ColumnId = "product" | "category" | "brand" | "collection" | "price" | "variants" | "status" | "updated_at";

type ColumnDef = { header: string; sortKey?: ProductSortKey; className?: string; width?: string };

/** Lower-priority columns drop out on small screens; name, price and actions stay. */
const COLUMNS: Record<ColumnId, ColumnDef> = {
  product: { header: "Product", sortKey: "name" },
  category: { header: "Category", className: "hidden md:table-cell", width: "w-44" },
  brand: { header: "Brand", className: "hidden lg:table-cell", width: "w-36" },
  collection: { header: "Collection", className: "hidden 2xl:table-cell", width: "w-36" },
  price: { header: "Price", sortKey: "price", className: "hidden sm:table-cell", width: "w-32" },
  variants: { header: "Variants", className: "hidden xl:table-cell", width: "w-24" },
  status: { header: "Visibility", className: "hidden sm:table-cell", width: "w-28" },
  updated_at: { header: "Last updated", sortKey: "updated_at", className: "hidden xl:table-cell", width: "w-36" },
};

const COLUMN_ORDER: ColumnId[] = ["product", "category", "brand", "collection", "price", "variants", "status", "updated_at"];

type Props = {
  items: ProductListItem[];
  state: ProductQueryState;
  listUrl: string;
  reorderEnabled: boolean;
  reorderLocked: boolean;
  onReorder: (request: ReorderRequest) => void;
  onSort: (sort: ProductSortKey) => void;
  onToggleVisibility: (item: ProductListItem) => void;
  onDelete: (item: ProductListItem) => void;
  onBarcode: (item: ProductListItem) => void;
  dimmed: boolean;
};

export function ProductDataTable({
  items,
  state,
  listUrl,
  reorderEnabled,
  reorderLocked,
  onReorder,
  onSort,
  onToggleVisibility,
  onDelete,
  onBarcode,
  dimmed,
}: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const fromParam = `?from=${encodeURIComponent(listUrl)}`;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);

  const sensors = useSensors(
    // A small distance stops clicks on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements = useMemo<Announcements>(() => {
    const label = (id: string | number) => `“${nameById.get(String(id)) ?? "product"}”`;
    const position = (id: string | number) => ids.indexOf(String(id)) + 1;
    return {
      onDragStart: ({ active }) => `Picked up ${label(active.id)}, position ${position(active.id)} of ${ids.length} loaded.`,
      onDragOver: ({ active, over }) =>
        over ? `${label(active.id)} moved to position ${position(over.id)}.` : `${label(active.id)} is no longer over a position.`,
      onDragEnd: ({ active, over }) =>
        over ? `${label(active.id)} dropped at position ${position(over.id)}. Saving the new order.` : `${label(active.id)} dropped. Order unchanged.`,
      onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled. Order unchanged.`,
    };
  }, [ids, nameById]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || reorderLocked) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    // Positions are resolved in the database relative to the target row, so a
    // drop is correct even though only part of the catalogue is loaded.
    onReorder({ id: String(active.id), targetId: String(over.id), position: to > from ? "after" : "before", toIndex: to });
  }

  return (
    <div className={cn("overflow-x-auto border border-border transition-opacity", dimmed && "opacity-60")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To reorder, press Space or Enter on the drag handle, use the arrow keys to move the product, then press Space or Enter again to drop. Press Escape to cancel.",
          },
        }}
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Products{reorderEnabled ? ". Rows can be reordered with the drag handles." : ""}</caption>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {reorderEnabled && (
                <th scope="col" className="h-10 w-12 px-2">
                  <span className="sr-only">Reorder</span>
                </th>
              )}
              {COLUMN_ORDER.map((column) => (
                <HeaderCell key={column} def={COLUMNS[column]} state={state} onSort={onSort} />
              ))}
              <th scope="col" className="h-10 w-14 px-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!reorderEnabled || reorderLocked}>
            <tbody>
              {items.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  showHandle={reorderEnabled}
                  handleDisabled={reorderLocked}
                  reducedMotion={reducedMotion}
                  detailHref={`${productRoutes.detail(item.id)}${fromParam}`}
                  editHref={`${productRoutes.edit(item.id)}${fromParam}`}
                  onMove={
                    reorderEnabled
                      ? (position) =>
                          onReorder({ id: item.id, targetId: null, position, toIndex: position === "first" ? 0 : "end-or-remove" })
                      : undefined
                  }
                  onToggleVisibility={onToggleVisibility}
                  onDelete={onDelete}
                  onBarcode={onBarcode}
                />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>
    </div>
  );
}

function HeaderCell({ def, state, onSort }: { def: ColumnDef; state: ProductQueryState; onSort: (sort: ProductSortKey) => void }) {
  const active = def.sortKey !== undefined && state.sort === def.sortKey;
  const ariaSort = active ? (state.dir === "asc" ? "ascending" : "descending") : undefined;
  const Icon = !active ? ChevronsUpDown : state.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn("h-10 px-3 text-left text-xs font-medium tracking-wide text-muted-foreground", def.width, def.className)}
    >
      {def.sortKey ? (
        <button
          type="button"
          onClick={() => onSort(def.sortKey!)}
          className={cn(
            "-mx-1.5 inline-flex h-7 items-center gap-1.5 px-1.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
            active && "text-foreground",
          )}
        >
          {def.header}
          <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
        </button>
      ) : (
        def.header
      )}
    </th>
  );
}

function RelationCell({ value, empty, secondary }: { value: RelationRef | null; empty: string; secondary?: RelationRef | null }) {
  if (!value) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="grid min-w-0 leading-tight">
      <span className={cn("truncate", !value.isActive && "text-muted-foreground")} title={value.isActive ? value.name : `${value.name} (hidden)`}>
        {value.name}
        {!value.isActive && <span className="sr-only"> (hidden)</span>}
      </span>
      {secondary !== undefined && (
        <span className="truncate text-xs text-muted-foreground">{secondary ? secondary.name : "No department"}</span>
      )}
    </span>
  );
}

type RowProps = {
  item: ProductListItem;
  showHandle: boolean;
  handleDisabled: boolean;
  reducedMotion: boolean;
  detailHref: string;
  editHref: string;
  onMove?: (position: "first" | "last") => void;
  onToggleVisibility: (item: ProductListItem) => void;
  onDelete: (item: ProductListItem) => void;
  onBarcode: (item: ProductListItem) => void;
};

const ProductRow = memo(function ProductRow({
  item,
  showHandle,
  handleDisabled,
  reducedMotion,
  detailHref,
  editHref,
  onMove,
  onToggleVisibility,
  onDelete,
  onBarcode,
}: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isSorting } = useSortable({
    id: item.id,
    disabled: !showHandle || handleDisabled,
    transition: reducedMotion ? null : { duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });

  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition: reducedMotion ? undefined : transition };
  const updated = formatDate(item.updatedAt);
  const final = discountedPrice(item.price, item.discount);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/row relative h-16 border-b border-border bg-background last:border-b-0",
        !isSorting && "hover:bg-muted/30",
        isDragging && "z-10 bg-background shadow-lg ring-1 ring-foreground/15",
      )}
    >
      {showHandle && (
        <td className="px-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            disabled={handleDisabled}
            aria-label={`Reorder ${item.name}`}
            className={cn(
              "inline-flex size-8 touch-none items-center justify-center text-muted-foreground/60 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40",
              isDragging ? "cursor-grabbing text-foreground" : "cursor-grab",
            )}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        </td>
      )}

      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 shrink-0 rounded-none border border-border bg-muted">
            {item.coverImageUrl && <AvatarImage src={item.coverImageUrl} alt="" loading="lazy" className="object-cover" />}
            <AvatarFallback className="rounded-none bg-muted text-[0.625rem] font-semibold text-muted-foreground">
              {initials(item.name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-0.5 leading-tight">
            <span className="flex min-w-0 items-center gap-2">
              <Link
                href={detailHref}
                className="truncate font-medium outline-none hover:underline hover:underline-offset-4 focus-visible:underline"
                draggable={false}
              >
                {item.name}
              </Link>
              {item.label && <ProductLabelBadge label={item.label} color={item.labelColor} background={item.labelBg} />}
            </span>
            {/* Inline on small screens where these columns are hidden. */}
            <span className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
              <span className="tabular-nums">{formatPrice(final)}</span>
              <StatusBadge active={item.isActive} className="h-5 text-[0.6875rem]" />
            </span>
            <span className="hidden truncate text-xs text-muted-foreground sm:block md:hidden">
              {item.category?.name ?? "No category"}
            </span>
          </div>
        </div>
      </td>
      <td className={cn("px-3 py-2", COLUMNS.category.className)}>
        <RelationCell value={item.category} empty="No category" secondary={item.category ? item.department : undefined} />
      </td>
      <td className={cn("px-3 py-2", COLUMNS.brand.className)}>
        <RelationCell value={item.brand} empty="No brand" />
      </td>
      <td className={cn("px-3 py-2", COLUMNS.collection.className)}>
        <RelationCell value={item.collection} empty="No collection" />
      </td>
      <td className={cn("px-3 py-2 tabular-nums", COLUMNS.price.className)}>
        <span className="grid leading-tight">
          <span className="font-medium">{formatPrice(final)}</span>
          {item.discount > 0 && (
            <span className="text-xs text-muted-foreground">
              <s>{formatPrice(item.price)}</s> −{item.discount}%
            </span>
          )}
        </span>
      </td>
      <td className={cn("px-3 py-2 tabular-nums", COLUMNS.variants.className)}>
        {item.variantCount === 0 ? (
          <span className="text-amber-700 dark:text-amber-400" title="Products without variants can't be added to carts.">
            None
          </span>
        ) : (
          formatCount(item.variantCount)
        )}
      </td>
      <td className={cn("px-3 py-2", COLUMNS.status.className)}>
        <StatusBadge active={item.isActive} />
      </td>
      <td className={cn("px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums", COLUMNS.updated_at.className)}>
        <time dateTime={item.updatedAt} title={updated.full}>
          {updated.short}
        </time>
      </td>
      <td className="px-2 text-right">
        <ProductRowActions
          item={item}
          detailHref={detailHref}
          editHref={editHref}
          onMove={onMove}
          moveDisabled={handleDisabled}
          onToggleVisibility={() => onToggleVisibility(item)}
          onDelete={() => onDelete(item)}
          onBarcode={() => onBarcode(item)}
        />
      </td>
    </tr>
  );
});
