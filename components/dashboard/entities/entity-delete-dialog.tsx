"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Link2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { countDependents } from "@/lib/entities/client";
import type { EntityConfig } from "@/lib/entities/config";
import { entityKeys } from "@/lib/entities/hooks";
import type { EntityListItem } from "@/lib/entities/types";

type Props = {
  config: EntityConfig;
  item: EntityListItem | null;
  open: boolean;
  isPending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: EntityListItem) => void;
};

export function EntityDeleteDialog({ config, item, open, isPending, error, onOpenChange, onConfirm }: Props) {
  const singular = config.singular.toLowerCase();

  // Head-only COUNT queries — tells the admin what the database's ON DELETE SET NULL will touch.
  const dependents = useQuery({
    queryKey: [...entityKeys.entity(config.key), "dependents", item?.id ?? ""],
    queryFn: () => countDependents(config.key, item!.id),
    enabled: open && item !== null,
    staleTime: 0,
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-md">
        {item && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{item.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the {singular} and its image. This can&apos;t be undone. To take it off the
                storefront temporarily, hide it instead.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid gap-2 border border-border bg-muted/30 px-4 py-3 text-sm">
              {config.dependents.map((dependent, index) => {
                const result = dependents.data?.[index];
                let text: string;
                if (dependents.isPending) text = `Checking linked ${dependent.plural}…`;
                else if (!result || result.count === null)
                  text = `Any linked ${dependent.plural} will be kept but will no longer belong to this ${singular}.`;
                else if (result.count === 0) text = `No ${dependent.plural} are linked to this ${singular}.`;
                else
                  text = `${result.count} ${result.count === 1 ? dependent.singular : dependent.plural} will be kept but will no longer belong to this ${singular}.`;
                return (
                  <p key={dependent.table} className="flex items-start gap-2 text-muted-foreground">
                    {dependents.isPending ? (
                      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span aria-live="polite">{text}</span>
                  </p>
                );
              })}
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />} disabled={isPending}>
                Cancel
              </AlertDialogClose>
              <Button
                className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
                onClick={() => onConfirm(item)}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                {isPending ? "Deleting…" : `Delete ${singular}`}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
