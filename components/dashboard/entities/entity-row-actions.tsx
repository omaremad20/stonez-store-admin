"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine, Eye, EyeOff, FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EntityListItem } from "@/lib/entities/types";

type Props = {
  item: EntityListItem;
  detailHref: string;
  editHref: string;
  /** Present only while manual reordering is allowed. */
  onMove?: (position: "first" | "last") => void;
  moveDisabled?: boolean;
  onToggleVisibility: () => void;
  onDelete: () => void;
};

export function EntityRowActions({
  item,
  detailHref,
  editHref,
  onMove,
  moveDisabled,
  onToggleVisibility,
  onDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />}
        aria-label={`Actions for ${item.name}`}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLinkItem render={<Link href={detailHref} />}>
          <FileText aria-hidden />
          View
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={editHref} />}>
          <Pencil aria-hidden />
          Edit
        </DropdownMenuLinkItem>

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
