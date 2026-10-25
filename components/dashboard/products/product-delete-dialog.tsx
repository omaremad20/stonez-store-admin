"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, EyeOff, Layers, Loader2, Lock, Trash2 } from "lucide-react";

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
import { fetchProduct } from "@/lib/products/client";
import { productKeys } from "@/lib/products/hooks";

type Item = { id: string; name: string; isActive: boolean };

type Props = {
  item: Item | null;
  open: boolean;
  isPending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: Item) => void;
  /** Offered when variants are locked (printed / in a cart): hide instead of delete. */
  onHideInstead?: (item: Item) => void;
};

/**
 * Delete confirmation. Variants cascade with the product; the database
 * refuses while any variant is printed or in a cart (products_protect_deletion),
 * so the dialog checks first and offers "Hide" instead. The trigger stays
 * authoritative — a lock that appears in between is still reported.
 */
export function ProductDeleteDialog({ item, open, isPending, error, onOpenChange, onConfirm, onHideInstead }: Props) {
  const detail = useQuery({
    queryKey: [...productKeys.detail(item?.id ?? ""), "delete-check"],
    queryFn: ({ signal }) => fetchProduct(item!.id, signal),
    enabled: open && item !== null,
    staleTime: 0,
    retry: false,
  });

  const variants = detail.data?.variants ?? [];
  const locked = variants.filter((variant) => variant.lockReason !== null);
  const printed = locked.filter((variant) => variant.isPrinted).length;
  const inCart = locked.filter((variant) => variant.cartLineCount > 0).length;
  const blocked = locked.length > 0;

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
                This permanently deletes the product, all of its variants and their images, and removes it from customers&apos;
                favorites. This can&apos;t be undone. To take it off the storefront temporarily, hide it instead.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid gap-2 border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
              {detail.isPending ? (
                <p className="flex items-start gap-2">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                  Checking variants…
                </p>
              ) : detail.isError ? (
                <p className="flex items-start gap-2">
                  <Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Variants couldn&apos;t be checked. The database will still refuse the delete if any of them are locked.
                </p>
              ) : (
                <>
                  <p className="flex items-start gap-2">
                    <Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {variants.length === 0
                      ? "This product has no variants."
                      : `${variants.length} ${variants.length === 1 ? "variant" : "variants"} will be deleted with it.`}
                  </p>
                  {blocked && (
                    <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        It can&apos;t be deleted:{" "}
                        {[
                          printed > 0 ? `${printed} ${printed === 1 ? "variant has a" : "variants have"} printed label${printed === 1 ? "" : "s"}` : null,
                          inCart > 0 ? `${inCart} ${inCart === 1 ? "variant is" : "variants are"} in customers' carts` : null,
                        ]
                          .filter(Boolean)
                          .join(" and ")}
                        . Hide it instead.
                      </span>
                    </p>
                  )}
                </>
              )}
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
              {blocked && item.isActive && onHideInstead ? (
                <Button onClick={() => onHideInstead(item)} disabled={isPending}>
                  <EyeOff aria-hidden />
                  Hide instead
                </Button>
              ) : null}
              <Button
                className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
                onClick={() => onConfirm(item)}
                disabled={isPending || blocked || detail.isPending}
                aria-busy={isPending}
              >
                {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                {isPending ? "Deleting…" : "Delete product"}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
