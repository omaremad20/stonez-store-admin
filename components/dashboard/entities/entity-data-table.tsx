"use client";

import { memo, useMemo, useSyncExternalStore, type CSSProperties } from "react";
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
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EntityRowActions } from "@/components/dashboard/entities/entity-row-actions";
import { StatusBadge } from "@/components/dashboard/entities/status-badge";
import { entityRoutes, type EntityColumnId, type EntityConfig } from "@/lib/entities/config";
import type { EntityQueryState, SortKey } from "@/lib/entities/query-state";
import type { EntityListItem } from "@/lib/entities/types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------- columns */

type ColumnDef = {
  header: string;
  sortKey?: SortKey;
  /** Responsive visibility — lower-priority columns drop out on small screens. */
  className?: string;
};

const COLUMN_DEFS: Record<EntityColumnId, ColumnDef & { width?: string }> = {
  name: { header: "Name", sortKey: "name" },
  department: { header: "Department", className: "hidden md:table-cell", width: "w-44" },
  status: { header: "Visibility", className: "hidden sm:table-cell", width: "w-32" },
  updated_at: { header: "Last updated", sortKey: "updated_at", className: "hidden lg:table-cell", width: "w-40" },
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { short: "—", full: "" } : { short: dateFormatter.format(date), full: dateTimeFormatter.format(date) };
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

/* ---------------------------------------------------------- motion pref */

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/* ---------------------------------------------------------------- table */

export type ReorderRequest = {
  id: string;
  targetId: string | null;
  position: "before" | "after" | "first" | "last";
  toIndex: number | "end-or-remove";
};

type Props = {
  config: EntityConfig;
  items: EntityListItem[];
  state: EntityQueryState;
  listUrl: string;
  /** Manual ordering is allowed for this view (sort/filters permit it). */
  reorderEnabled: boolean;
  /** A save is in flight or the list is re-syncing — handles are locked. */
  reorderLocked: boolean;
  onReorder: (request: ReorderRequest) => void;
  onSort: (sort: SortKey) => void;
  onToggleVisibility: (item: EntityListItem) => void;
  onDelete: (item: EntityListItem) => void;
  dimmed: boolean;
};

export function EntityDataTable({
  config,
  items,
  state,
  listUrl,
  reorderEnabled,
  reorderLocked,
  onReorder,
  onSort,
  onToggleVisibility,
  onDelete,
  dimmed,
}: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const routes = entityRoutes(config);
  const fromParam = `?from=${encodeURIComponent(listUrl)}`;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const nameById = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);

  const sensors = useSensors(
    // A small distance stops clicks on the handle from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements = useMemo<Announcements>(() => {
    const label = (id: string | number) => `“${nameById.get(String(id)) ?? "row"}”`;
    const position = (id: string | number) => ids.indexOf(String(id)) + 1;
    return {
      onDragStart: ({ active }) => `Picked up ${label(active.id)}, position ${position(active.id)} of ${ids.length}.`,
      onDragOver: ({ active, over }) =>
        over ? `${label(active.id)} moved to position ${position(over.id)} of ${ids.length}.` : `${label(active.id)} is no longer over a position.`,
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
    // Dropping lower places the row after the row it landed on; higher, before it.
    onReorder({ id: String(active.id), targetId: String(over.id), position: to > from ? "after" : "before", toIndex: to });
  }

  const showHandle = reorderEnabled;

  return (
    <div className={cn("border border-border transition-opacity", dimmed && "opacity-60")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To reorder, press Space or Enter on the drag handle, use the arrow keys to move the row, then press Space or Enter again to drop. Press Escape to cancel.",
          },
        }}
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {config.plural}
            {reorderEnabled ? ". Rows can be reordered with the drag handles." : ""}
          </caption>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {showHandle && (
                <th scope="col" className="h-10 w-12 px-2">
                  <span className="sr-only">Reorder</span>
                </th>
              )}
              {config.columns.map((column) => (
                <HeaderCell key={column} def={COLUMN_DEFS[column]} state={state} onSort={onSort} />
              ))}
              <th scope="col" className="h-10 w-14 px-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!reorderEnabled || reorderLocked}>
            <tbody>
              {items.map((item) => (
                <EntityRow
                  key={item.id}
                  item={item}
                  config={config}
                  showHandle={showHandle}
                  handleDisabled={reorderLocked}
                  reducedMotion={reducedMotion}
                  detailHref={`${routes.detail(item.id)}${fromParam}`}
                  editHref={`${routes.edit(item.id)}${fromParam}`}
                  onMove={
                    reorderEnabled
                      ? (position) =>
                          onReorder({
                            id: item.id,
                            targetId: null,
                            position,
                            toIndex: position === "first" ? 0 : "end-or-remove",
                          })
                      : undefined
                  }
                  onToggleVisibility={onToggleVisibility}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>
    </div>
  );
}

/* --------------------------------------------------------------- header */

function HeaderCell({
  def,
  state,
  onSort,
}: {
  def: ColumnDef & { width?: string };
  state: EntityQueryState;
  onSort: (sort: SortKey) => void;
}) {
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

/* ------------------------------------------------------------------ row */

type RowProps = {
  item: EntityListItem;
  config: EntityConfig;
  showHandle: boolean;
  handleDisabled: boolean;
  reducedMotion: boolean;
  detailHref: string;
  editHref: string;
  onMove?: (position: "first" | "last") => void;
  onToggleVisibility: (item: EntityListItem) => void;
  onDelete: (item: EntityListItem) => void;
};

const EntityRow = memo(function EntityRow({
  item,
  config,
  showHandle,
  handleDisabled,
  reducedMotion,
  detailHref,
  editHref,
  onMove,
  onToggleVisibility,
  onDelete,
}: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isSorting } =
    useSortable({
      id: item.id,
      disabled: !showHandle || handleDisabled,
      transition: reducedMotion ? null : { duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
    });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: reducedMotion ? undefined : transition,
  };
  const updated = formatDate(item.updatedAt);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/row relative h-15 border-b border-border bg-background last:border-b-0",
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

      {config.columns.map((column) => {
        const def = COLUMN_DEFS[column];
        switch (column) {
          case "name":
            return (
              <td key={column} className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-8 shrink-0 rounded-none border border-border bg-muted">
                    {item.imageUrl && <AvatarImage src={item.imageUrl} alt="" loading="lazy" className="object-contain p-0.5" />}
                    <AvatarFallback className="rounded-none bg-muted text-[0.625rem] font-semibold text-muted-foreground">
                      {initials(item.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 leading-tight">
                    <Link
                      href={detailHref}
                      className="truncate font-medium outline-none hover:underline hover:underline-offset-4 focus-visible:underline"
                      draggable={false}
                    >
                      {item.name}
                    </Link>
                    {item.slug && <span className="truncate font-mono text-xs text-muted-foreground">/{item.slug}</span>}
                    {/* Shown inline on small screens where the badge column is hidden. */}
                    <span className="mt-1 sm:hidden">
                      <StatusBadge active={item.isActive} className="h-5 text-[0.6875rem]" />
                    </span>
                  </div>
                </div>
              </td>
            );
          case "department":
            return (
              <td key={column} className={cn("px-3 py-2", def.className)}>
                {item.department ? (
                  <span className="truncate">{item.department.name}</span>
                ) : (
                  <span className="text-muted-foreground">No department</span>
                )}
              </td>
            );
          case "status":
            return (
              <td key={column} className={cn("px-3 py-2", def.className)}>
                <StatusBadge active={item.isActive} />
              </td>
            );
          case "updated_at":
            return (
              <td key={column} className={cn("px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums", def.className)}>
                <time dateTime={item.updatedAt} title={updated.full}>
                  {updated.short}
                </time>
              </td>
            );
        }
      })}

      <td className="px-2 text-right">
        <EntityRowActions
          item={item}
          detailHref={detailHref}
          editHref={editHref}
          onMove={onMove}
          moveDisabled={handleDisabled}
          onToggleVisibility={() => onToggleVisibility(item)}
          onDelete={() => onDelete(item)}
        />
      </td>
    </tr>
  );
});
