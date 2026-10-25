"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchField, SortControl, StatusFilterControl } from "@/components/dashboard/entities/entity-toolbar";
import { useProductOptions } from "@/lib/products/hooks";
import {
  DEFAULT_PRODUCT_QUERY_STATE,
  PRODUCT_SORT_KEYS,
  PRODUCT_SORT_LABELS,
  RELATION_FILTER_KEYS,
  type ProductQueryState,
  type RelationFilter,
  type RelationFilterKey,
} from "@/lib/products/query-state";
import type { RelationOption } from "@/lib/products/types";

type Props = {
  state: ProductQueryState;
  onChange: (patch: Partial<ProductQueryState>) => void;
  onReset: () => void;
  isUpdating: boolean;
};

const FILTER_COPY: Record<RelationFilterKey, { all: string; none: string; label: string }> = {
  department: { all: "All departments", none: "No department", label: "Filter by department" },
  category: { all: "All categories", none: "No category", label: "Filter by category" },
  brand: { all: "All brands", none: "No brand", label: "Filter by brand" },
  collection: { all: "All collections", none: "No collection", label: "Filter by collection" },
};

export function ProductToolbar({ state, onChange, onReset, isUpdating }: Props) {
  const options = useProductOptions();
  const isDefault =
    !state.q &&
    state.status === DEFAULT_PRODUCT_QUERY_STATE.status &&
    state.sort === DEFAULT_PRODUCT_QUERY_STATE.sort &&
    RELATION_FILTER_KEYS.every((key) => state[key] === null);

  // Narrow the category list to the chosen department (categories belong to one).
  const categories =
    state.department && state.department !== "none"
      ? (options.data?.categories ?? []).filter((category) => category.departmentId === state.department)
      : state.department === "none"
        ? (options.data?.categories ?? []).filter((category) => category.departmentId === null)
        : (options.data?.categories ?? []);

  const lists: Record<RelationFilterKey, RelationOption[]> = {
    department: options.data?.departments ?? [],
    category: categories,
    brand: options.data?.brands ?? [],
    collection: options.data?.collections ?? [],
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchField
          label="Search products"
          placeholder="Search by name or 10-digit barcode…"
          value={state.q}
          onCommit={(q) => onChange({ q })}
          isUpdating={isUpdating}
        />
        <div className="flex flex-wrap items-center gap-2">
          <StatusFilterControl value={state.status} onChange={(status) => onChange({ status })} />
          <SortControl sort={state.sort} dir={state.dir} keys={PRODUCT_SORT_KEYS} labels={PRODUCT_SORT_LABELS} onChange={onChange} />
          {!isDefault && (
            <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
              <RotateCcw aria-hidden />
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {(["department", "category", "brand", "collection"] as const).map((key) => (
          <RelationFilterSelect
            key={key}
            filterKey={key}
            value={state[key]}
            options={lists[key]}
            loading={options.isPending}
            failed={options.isError}
            onRetry={() => void options.refetch()}
            onChange={(value) => {
              // A category from another department would always yield zero rows.
              if (key === "department" && state.category) {
                onChange({ department: value, category: null });
              } else {
                onChange({ [key]: value });
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

const ALL = "__all__";

function RelationFilterSelect({
  filterKey,
  value,
  options,
  loading,
  failed,
  onRetry,
  onChange,
}: {
  filterKey: RelationFilterKey;
  value: RelationFilter | null;
  options: RelationOption[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onChange: (value: RelationFilter | null) => void;
}) {
  const copy = FILTER_COPY[filterKey];
  const items: Record<string, string> = { [ALL]: copy.all, none: copy.none };
  for (const option of options) items[option.id] = option.isActive ? option.name : `${option.name} (hidden)`;
  // Keep a filter from the URL readable even if it's not in the current list.
  if (value && !items[value]) items[value] = "Selected";

  if (failed) {
    return (
      <Button variant="outline" size="sm" onClick={onRetry} className="text-muted-foreground" aria-label={`${copy.label}: options failed to load. Retry`}>
        <RotateCcw aria-hidden />
        {copy.all}
      </Button>
    );
  }

  return (
    <Select
      items={items}
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL || typeof next !== "string" ? null : next)}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label={copy.label} data-active={value ? "" : undefined}>
        <SelectValue className="data-[placeholder]:text-muted-foreground" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{copy.all}</SelectItem>
        <SelectSeparator />
        {loading && (
          <SelectItem value="__loading__" disabled>
            Loading…
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {items[option.id]}
          </SelectItem>
        ))}
        {!loading && options.length === 0 && (
          <SelectItem value="__empty__" disabled>
            Nothing to choose yet
          </SelectItem>
        )}
        <SelectSeparator />
        <SelectItem value="none">{copy.none}</SelectItem>
      </SelectContent>
    </Select>
  );
}
