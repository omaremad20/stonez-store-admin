"use client";

import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";

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
import { StatusBadge } from "@/components/dashboard/entities/status-badge";

type Item = { id: string; name: string; isActive: boolean };

type Props = {
  item: Item | null;
  open: boolean;
  isPending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: Item, nextActive: boolean) => void;
};

/**
 * Hide / show confirmation. Hiding runs the database's deactivation triggers,
 * which remove the product from customers' carts and favorites — said here
 * so the admin isn't surprised.
 */
export function ProductVisibilityDialog({ item, open, isPending, error, onOpenChange, onConfirm }: Props) {
  const willShow = item ? !item.isActive : false;

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
              <AlertDialogTitle>
                {willShow ? "Show" : "Hide"} “{item.name}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {willShow
                  ? "This product will become visible to customers on the storefront. Each variant keeps its own visibility."
                  : "This product will be hidden from customers. It will also be removed from customers' carts and favorites. Nothing is deleted, and you can show it again at any time."}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex items-center gap-3 border border-border bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Visibility</span>
              <span className="ml-auto flex items-center gap-2">
                <StatusBadge active={item.isActive} />
                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="changes to" />
                <StatusBadge active={willShow} />
              </span>
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
              <Button onClick={() => onConfirm(item, willShow)} disabled={isPending} aria-busy={isPending}>
                {isPending ? <Loader2 className="animate-spin" aria-hidden /> : willShow ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                {isPending ? "Saving…" : willShow ? "Show product" : "Hide product"}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
