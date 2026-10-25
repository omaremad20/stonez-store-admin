import { cn } from "@/lib/utils";

/** The storefront label ("New", "Sale"…) in its configured colours. */
export function ProductLabelBadge({
  label,
  color,
  background,
  className,
}: {
  label: string;
  color: string | null;
  background: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center border border-border px-1.5 text-[0.625rem] font-semibold tracking-wide uppercase",
        !background && "bg-muted",
        className,
      )}
      style={{ color: color ?? undefined, backgroundColor: background ?? undefined, borderColor: background ?? undefined }}
    >
      {label}
    </span>
  );
}
