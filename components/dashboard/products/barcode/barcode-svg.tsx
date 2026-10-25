"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { BARCODE_PATTERN } from "@/lib/products/constants";
import { cn } from "@/lib/utils";

/**
 * Code 128 rendering of a variant's stored barcode. jsbarcode is loaded only
 * when a barcode is actually shown. Bars only — the human-readable digits are
 * laid out by the label so they never distort when the SVG is scaled.
 *
 * The SVG scales horizontally as a whole (every module by the same factor), so
 * the symbol stays valid at any label width. 10 quiet-zone modules each side.
 */
export const BARCODE_QUIET_ZONE_MODULES = 10;

export type BarcodeRenderState = "rendering" | "ready" | "invalid" | "error";

export function BarcodeSvg({
  value,
  className,
  style,
  onStateChange,
  svgRef,
}: {
  value: string;
  className?: string;
  style?: CSSProperties;
  onStateChange?: (state: BarcodeRenderState) => void;
  /** Exposes the rendered <svg> (the print step serialises it). */
  svgRef?: (node: SVGSVGElement | null) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const valid = BARCODE_PATTERN.test(value);
  const [state, setState] = useState<BarcodeRenderState>(valid ? "rendering" : "invalid");
  const onStateRef = useRef(onStateChange);

  useEffect(() => {
    onStateRef.current = onStateChange;
  });

  // Adjust during render when the value changes (no effect needed for this part).
  const [renderedFor, setRenderedFor] = useState(value);
  if (renderedFor !== value) {
    setRenderedFor(value);
    setState(valid ? "rendering" : "invalid");
  }

  useEffect(() => {
    onStateRef.current?.(state);
  }, [state]);

  useEffect(() => {
    if (!valid || !ref.current) return;
    let cancelled = false;
    const node = ref.current;

    import("jsbarcode")
      .then(({ default: JsBarcode }) => {
        if (cancelled) return;
        let ok = true;
        JsBarcode(node, value, {
          format: "CODE128",
          width: 2,
          height: 60,
          margin: 0,
          marginLeft: BARCODE_QUIET_ZONE_MODULES * 2,
          marginRight: BARCODE_QUIET_ZONE_MODULES * 2,
          displayValue: false,
          background: "#ffffff",
          lineColor: "#000000",
          valid: (isValid: boolean) => {
            ok = isValid;
          },
        });
        if (!ok) {
          setState("error");
          return;
        }
        // Scale-to-fit: keep the intrinsic size as the viewBox.
        const width = node.getAttribute("width");
        const height = node.getAttribute("height");
        if (width && height) {
          node.setAttribute("viewBox", `0 0 ${Number.parseFloat(width)} ${Number.parseFloat(height)}`);
          node.removeAttribute("width");
          node.removeAttribute("height");
        }
        node.setAttribute("preserveAspectRatio", "none");
        node.setAttribute("shape-rendering", "crispEdges");
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [value, valid]);

  if (!valid) return null;

  return (
    <svg
      ref={(node) => {
        ref.current = node;
        svgRef?.(node);
      }}
      role="img"
      aria-label={`Barcode ${value}`}
      className={cn("block w-full", state !== "ready" && "invisible", className)}
      style={style}
    />
  );
}
