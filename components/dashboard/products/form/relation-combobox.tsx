"use client";

import { useMemo } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";

import type { FieldControlProps } from "@/components/dashboard/entities/form-field";
import { cn } from "@/lib/utils";

export type RelationItem = { value: string; label: string; hint?: string; hidden?: boolean };

type Props = {
  control: FieldControlProps;
  /** Selected id, "" for none. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: RelationItem[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  /** Shown for a selected id that isn't in `options` (e.g. outside the current filter). */
  fallbackLabel?: string;
};

/**
 * Searchable single-select for brand / category / collection. Styled like the
 * dashboard Select; hidden (inactive) records stay selectable and are marked.
 */
export function RelationCombobox({ control, value, onChange, onBlur, options, placeholder, emptyText, disabled, fallbackLabel }: Props) {
  const selected = useMemo<RelationItem | null>(() => {
    if (!value) return null;
    return options.find((option) => option.value === value) ?? { value, label: fallbackLabel ?? "Current selection" };
  }, [value, options, fallbackLabel]);

  const items = useMemo(() => (selected && !options.some((option) => option.value === selected.value) ? [selected, ...options] : options), [options, selected]);

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? "")}
      isItemEqualToValue={(item, current) => item.value === current.value}
      disabled={disabled}
    >
      <Combobox.InputGroup className="relative">
        <Combobox.Input
          {...control}
          placeholder={placeholder}
          onBlur={onBlur}
          className="h-9 w-full min-w-0 border border-border bg-background pr-16 pl-3 text-base outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive sm:text-sm"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {selected && !disabled && (
            <Combobox.Clear
              aria-label="Clear selection"
              className="inline-flex size-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <XIcon className="size-3.5" aria-hidden />
            </Combobox.Clear>
          )}
          <Combobox.Trigger
            aria-label="Show options"
            className="inline-flex size-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronsUpDownIcon className="size-3.5" aria-hidden />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={6}>
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) border border-border bg-popover text-popover-foreground shadow-lg outline-none transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Combobox.Empty className="px-3 py-4 text-sm text-muted-foreground empty:hidden">{emptyText}</Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 data-empty:p-0">
              {(item: RelationItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex min-h-9 cursor-default items-center gap-2 py-1.5 pr-8 pl-2.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="grid min-w-0 leading-tight">
                    <span className={cn("truncate", item.hidden && "text-muted-foreground")}>
                      {item.label}
                      {item.hidden && <span className="ml-1.5 text-xs">(hidden)</span>}
                    </span>
                    {item.hint && <span className="truncate text-xs text-muted-foreground">{item.hint}</span>}
                  </span>
                  <Combobox.ItemIndicator className="absolute right-2.5 flex items-center">
                    <CheckIcon className="size-4" aria-hidden />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
