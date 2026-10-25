import { HEX_COLOR_PATTERN } from "@/lib/products/constants";
import { cn } from "@/lib/utils";

/** Small colour chip for a variant's color_hash. */
export function ColorSwatch({ hex, className }: { hex: string; className?: string }) {
  const valid = HEX_COLOR_PATTERN.test(hex);
  return (
    <span
      className={cn("inline-block size-4 shrink-0 border border-black/15", !valid && "bg-muted", className)}
      style={valid ? { backgroundColor: hex } : undefined}
      aria-hidden
    />
  );
}
