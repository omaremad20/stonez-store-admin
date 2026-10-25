"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine, Barcode, Eye, EyeOff, FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  item: { name: string; isActive: boolean };
  detailHref?: string;
  editHref: string;
  /** Present only while manual reordering is allowed. */
  onMove?: (position: "first" | "last") => void;
  moveDisabled?: boolean;
  onToggleVisibility: () => void;
  onDelete: () => void;
  onBarcode: () => void;
  /** Trigger style: icon (table rows) or a labelled button (details page). */
  trigger?: "icon" | "button";
};

/** Same menu structure as the catalog entities, plus Barcode. */
export function ProductRowActions({
  item,
  detailHref,
  editHref,
  onMove,
  moveDisabled,
  onToggleVisibility,
  onDelete,
  onBarcode,
  trigger = "icon",
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger === "icon" ? (
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />
          ) : (
            <Button variant="outline" />
          )
        }
        aria-label={`Actions for ${item.name}`}
      >
        <MoreHorizontal className="size-4" aria-hidden />
        {trigger === "button" && "More"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {detailHref && (
          <DropdownMenuLinkItem render={<Link href={detailHref} />}>
            <FileText aria-hidden />
            View
          </DropdownMenuLinkItem>
        )}
        <DropdownMenuLinkItem render={<Link href={editHref} />}>
          <Pencil aria-hidden />
          Edit
        </DropdownMenuLinkItem>
        <DropdownMenuItem onClick={onBarcode}>
          <Barcode aria-hidden />
          Barcode
        </DropdownMenuItem>

        {onMove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMove("first")} disabled={moveDisabled}>
              <ArrowUpToLine aria-hidden />
              Move to top
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove("last")} disabled={moveDisabled}>
              <ArrowDownToLine aria-hidden />
              Move to bottom
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleVisibility}>
          {item.isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {item.isActive ? "Hide" : "Show"}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
