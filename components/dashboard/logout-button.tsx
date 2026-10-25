"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { navItemClassName } from "@/components/dashboard/sidebar-nav";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { cn } from "@/lib/utils";

export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const { signOut, isPending } = useSignOut();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the dialog open while the sign-out request is in flight.
        if (!isPending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger className={cn(navItemClassName, "hover:text-destructive")}>
        <LogOut className="size-4 shrink-0 text-sidebar-foreground/50 group-hover/nav:text-destructive" strokeWidth={1.75} aria-hidden />
        <span>Logout</span>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out of the dashboard?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be signed out of Stonez Store Dashboard on this device and returned to the
            sign-in page. Your Google account stays signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />} disabled={isPending}>
            Cancel
          </AlertDialogClose>
          <Button
            variant="default"
            onClick={() => void signOut()}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isPending ? "Logging out…" : "Logout"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
