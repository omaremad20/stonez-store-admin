"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, CircleAlert, CircleCheck, Loader2, Lock, PackagePlus, Printer, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeLabel } from "@/components/dashboard/products/barcode/barcode-label";
import type { BarcodeRenderState } from "@/components/dashboard/products/barcode/barcode-svg";
import { buildLabelDocument, LabelPrintError, printLabelDocument } from "@/components/dashboard/products/barcode/print-label";
import { ColorSwatch } from "@/components/dashboard/products/color-swatch";
import { toEntityError } from "@/lib/entities/errors";
import { BARCODE_PATTERN, LABEL_SIZE_MM, productRoutes } from "@/lib/products/constants";
import { fetchProduct } from "@/lib/products/client";
import { formatCount } from "@/lib/products/format";
import { productKeys, useMarkVariantPrinted } from "@/lib/products/hooks";
import type { ProductVariant } from "@/lib/products/types";
import { cn } from "@/lib/utils";

type Props = {
  product: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a variant (e.g. from the details page variants table). */
  initialVariantId?: string | null;
};

type Phase = "idle" | "printing" | "confirm";

/**
 * Reusable barcode workflow for one product: pick a variant, preview its label
 * at real size, print only the label, then confirm before the variant is
 * marked as printed (which permanently locks its barcode, size and colour).
 */
export function ProductBarcodeDialog({ product, open, onOpenChange, initialVariantId = null }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-6 sm:p-8">
        {product && (
          // Remount per product/variant so selection and print state start clean.
          <BarcodeWorkflow key={`${product.id}:${initialVariantId ?? ""}`} product={product} initialVariantId={initialVariantId} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BarcodeWorkflow({
  product,
  initialVariantId,
  onClose,
}: {
  product: { id: string; name: string };
  initialVariantId: string | null;
  onClose: () => void;
}) {
  // Always fresh: barcodes and printed state may have changed since the list loaded.
  const detail = useQuery({
    queryKey: productKeys.detail(product.id),
    queryFn: ({ signal }) => fetchProduct(product.id, signal),
    refetchOnMount: "always",
    retry: 1,
  });
  const markPrinted = useMarkVariantPrinted(product.id);

  const [selectedId, setSelectedId] = useState<string | null>(initialVariantId);
  const [barcodeState, setBarcodeState] = useState<BarcodeRenderState>("rendering");
  const [phase, setPhase] = useState<Phase>("idle");
  const [printError, setPrintError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupName = useId();

  const variants = detail.data?.variants ?? [];
  const selected = variants.find((variant) => variant.id === selectedId) ?? null;
  const name = detail.data?.name ?? product.name;
  const barcodeValid = selected ? BARCODE_PATTERN.test(selected.barcode) : false;

  function select(variant: ProductVariant) {
    if (phase !== "idle") return;
    setSelectedId(variant.id);
    setPrintError(null);
    markPrinted.reset();
  }

  async function print() {
    if (!selected || !svgRef.current || barcodeState !== "ready" || phase !== "idle") return;
    setPrintError(null);
    setPhase("printing");
    try {
      const html = buildLabelDocument(
        { barcode: selected.barcode, productName: name, colorName: selected.colorName, size: selected.size },
        svgRef.current.outerHTML,
      );
      await printLabelDocument(html);
      if (selected.isPrinted) {
        setPhase("idle");
        toast.success("Label sent to the printer.");
      } else {
        // Browsers don't report whether the user printed or cancelled.
        setPhase("confirm");
      }
    } catch (error) {
      setPhase("idle");
      setPrintError(error instanceof LabelPrintError ? error.message : "The label couldn't be printed. Try again.");
    }
  }

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="flex items-center gap-2">
          <Barcode className="size-4" aria-hidden />
          Print barcode label
        </DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{name}</span> — choose a variant to preview and print its label (
          {LABEL_SIZE_MM.width} × {LABEL_SIZE_MM.height} mm).
        </DialogDescription>
      </DialogHeader>

      {detail.isPending ? (
        <VariantTableSkeleton />
      ) : detail.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="flex-1">{toEntityError(detail.error).message}</span>
          <Button variant="outline" size="xs" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
            <RotateCcw aria-hidden />
            Retry
          </Button>
        </div>
      ) : variants.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-border px-5 py-8 sm:items-center sm:text-center">
          <PackagePlus className="size-5 text-muted-foreground" aria-hidden />
          <div className="grid gap-1">
            <p className="text-sm font-semibold">This product has no variants yet</p>
            <p className="text-sm text-muted-foreground">Barcodes belong to variants. Add a size and colour to generate one.</p>
          </div>
          <Link href={productRoutes.edit(product.id)} className={buttonVariants({ size: "sm", variant: "outline" })} onClick={onClose}>
            Add variants
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Variant</legend>
            <div className="max-h-64 overflow-auto border border-border">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="h-9 w-10 px-3">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col" className="px-3 font-medium">Size</th>
                    <th scope="col" className="px-3 font-medium">Colour</th>
                    <th scope="col" className="px-3 font-medium">Barcode</th>
                    <th scope="col" className="px-3 text-right font-medium">Stock</th>
                    <th scope="col" className="px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => {
                    const checked = variant.id === selectedId;
                    const inputId = `${groupName}-${variant.id}`;
                    return (
                      <tr
                        key={variant.id}
                        onClick={() => select(variant)}
                        className={cn("h-11 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40", checked && "bg-muted/60")}
                      >
                        <td className="px-3">
                          <input
                            id={inputId}
                            type="radio"
                            name={groupName}
                            checked={checked}
                            onChange={() => select(variant)}
                            disabled={phase !== "idle"}
                            className="size-4 accent-foreground"
                            aria-label={`${variant.size}, ${variant.colorName}, barcode ${variant.barcode || "missing"}`}
                          />
                        </td>
                        <td className="px-3 font-medium">
                          <label htmlFor={inputId} className="cursor-pointer">
                            {variant.size}
                          </label>
                        </td>
                        <td className="px-3">
                          <span className="flex items-center gap-2">
                            <ColorSwatch hex={variant.colorHash} />
                            <span className="truncate">{variant.colorName}</span>
                          </span>
                        </td>
                        <td className="px-3 font-mono text-xs tabular-nums">
                          {BARCODE_PATTERN.test(variant.barcode) ? variant.barcode : <span className="text-destructive">Invalid</span>}
                        </td>
                        <td className="px-3 text-right tabular-nums">{formatCount(variant.stock)}</td>
                        <td className="px-3">
                          <span className="flex flex-wrap items-center gap-1.5 text-xs">
                            {variant.isPrinted && (
                              <span className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5">
                                <Lock className="size-3" aria-hidden />
                                Printed
                              </span>
                            )}
                            {!variant.isActive && <span className="border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">Hidden</span>}
                            {variant.isActive && !variant.isPrinted && <span className="text-muted-foreground">Not printed</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>

          {selected ? (
            <section aria-labelledby={`${groupName}-preview`} className="grid gap-4 border border-border bg-muted/30 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6 sm:p-5">
              <h3 id={`${groupName}-preview`} className="sr-only">
                Label preview
              </h3>
              <div className="flex flex-col items-center gap-2">
                {barcodeValid ? (
                  <ScaledPreview>
                    <BarcodeLabel
                      key={selected.id}
                      content={{ barcode: selected.barcode, productName: name, colorName: selected.colorName, size: selected.size }}
                      onBarcodeState={setBarcodeState}
                      svgRef={(node) => {
                        svgRef.current = node;
                      }}
                    />
                  </ScaledPreview>
                ) : (
                  <div className="flex w-72 max-w-full flex-col items-center gap-2 border border-dashed border-destructive/40 bg-background px-4 py-6 text-center text-sm">
                    <CircleAlert className="size-4 text-destructive" aria-hidden />
                    This variant doesn&apos;t have a valid 10-digit barcode, so no label can be printed.
                  </div>
                )}
                {barcodeValid && <p className="text-[0.6875rem] text-muted-foreground">Preview enlarged · prints at actual size</p>}
              </div>

              <div className="grid gap-3 text-sm">
                {barcodeValid && barcodeState === "error" && (
                  <p role="alert" className="flex items-start gap-2 text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    The barcode couldn&apos;t be drawn. Reload the page and try again.
                  </p>
                )}
                {printError && (
                  <p role="alert" className="flex items-start gap-2 text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {printError}
                  </p>
                )}

                {phase === "confirm" ? (
                  <div className="grid gap-3 border border-amber-500/40 bg-amber-500/5 p-3" role="alertdialog" aria-labelledby={`${groupName}-confirm`}>
                    <p id={`${groupName}-confirm`} className="font-medium">
                      Did the label print correctly?
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Marking it as printed permanently locks this variant&apos;s barcode, size and colour, and it can no longer be deleted.
                    </p>
                    {markPrinted.error && (
                      <p role="alert" className="text-xs text-destructive">
                        {toEntityError(markPrinted.error).message}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => markPrinted.mutate({ variantId: selected.id }, { onSuccess: () => setPhase("idle") })}
                        disabled={markPrinted.isPending}
                        aria-busy={markPrinted.isPending}
                        autoFocus
                      >
                        {markPrinted.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
                        Yes, mark as printed
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPhase("idle")} disabled={markPrinted.isPending}>
                        It didn&apos;t print
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selected.isPrinted
                        ? "This label was printed before. Reprinting uses the same barcode."
                        : "Only the label is printed — set your printer to the label stock and turn off headers and footers if your browser adds them."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void print()}
                        disabled={!barcodeValid || barcodeState !== "ready" || phase !== "idle"}
                        aria-busy={phase === "printing"}
                      >
                        {phase === "printing" || (barcodeValid && barcodeState === "rendering") ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : (
                          <Printer aria-hidden />
                        )}
                        {phase === "printing" ? "Printing…" : "Print label"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : (
            <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Select a variant to preview its label.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Enlarged, layout-correct preview (transform alone wouldn't reserve space). */
function ScaledPreview({ children, scale = 1.6 }: { children: ReactNode; scale?: number }) {
  return (
    <div
      style={{ width: `calc(${LABEL_SIZE_MM.width}mm * ${scale})`, height: `calc(${LABEL_SIZE_MM.height}mm * ${scale})` }}
      className="max-w-full shrink-0 overflow-hidden"
    >
      {/* Sized to the label itself: a full-width layer would, once scaled, overlap (and block clicks on) the next column. */}
      <div className="w-max" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

function VariantTableSkeleton() {
  return (
    <div className="grid gap-px border border-border" aria-busy="true" aria-label="Loading variants">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex h-11 items-center gap-6 px-3">
          <div className="size-4 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-10 animate-pulse bg-muted" />
          <div className="h-3 w-28 animate-pulse bg-muted" />
          <div className="h-3 w-24 animate-pulse bg-muted" />
        </div>
      ))}
      <div className="m-4 h-28 animate-pulse bg-muted/60" />
    </div>
  );
}
