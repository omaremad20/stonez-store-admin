import { cn } from "@/lib/utils";

/** `is_active` presented as storefront visibility. */
export function StatusBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 border px-2 text-xs font-medium whitespace-nowrap",
        active ? "border-border bg-background text-foreground" : "border-dashed border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", active ? "bg-emerald-600" : "bg-muted-foreground/50")}
        aria-hidden
      />
      {active ? "Visible" : "Hidden"}
    </span>
  );
}
