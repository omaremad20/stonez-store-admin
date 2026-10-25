"use client";

import type { CSSProperties } from "react";

import { BarcodeSvg, type BarcodeRenderState } from "@/components/dashboard/products/barcode/barcode-svg";
import { LABEL_SIZE_MM } from "@/lib/products/constants";
import { labelProductName } from "@/lib/products/format";

/**
 * Label geometry in millimetres, derived from LABEL_SIZE_MM so a different
 * label stock only needs that one constant changed. Shared by the on-screen
 * preview and the printed document, so what you see is what prints.
 */
export function labelMetrics() {
  const { width, height } = LABEL_SIZE_MM;
  const paddingX = Math.max(1.5, width * 0.04);
  const paddingY = Math.max(1, height * 0.05);
  return {
    width,
    height,
    paddingX,
    paddingY,
    barsHeight: height * 0.44,
    digitsSize: height * 0.1,
    nameSize: height * 0.11,
    metaSize: height * 0.095,
  };
}

export type LabelContent = { barcode: string; productName: string; colorName: string; size: string };

/** The three label lines, exactly as required: barcode, first two words of the name, colour + size. */
export function labelLines({ barcode, productName, colorName, size }: LabelContent) {
  return { digits: barcode, name: labelProductName(productName), meta: `${colorName.trim()} · ${size.trim()}` };
}

const mm = (value: number) => `${value.toFixed(2)}mm`;

/** On-screen preview at true physical size (CSS mm). */
export function BarcodeLabel({
  content,
  onBarcodeState,
  svgRef,
}: {
  content: LabelContent;
  onBarcodeState?: (state: BarcodeRenderState) => void;
  svgRef?: (node: SVGSVGElement | null) => void;
}) {
  const m = labelMetrics();
  const lines = labelLines(content);

  const text: CSSProperties = {
    width: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    textAlign: "center",
    lineHeight: 1.15,
    fontFamily: "Arial, Helvetica, sans-serif",
    color: "#000",
  };

  return (
    <div
      className="flex flex-col items-center justify-center bg-white shadow-sm ring-1 ring-black/10"
      style={{ width: mm(m.width), height: mm(m.height), padding: `${mm(m.paddingY)} ${mm(m.paddingX)}`, boxSizing: "border-box" }}
      aria-label={`Label preview: barcode ${lines.digits}, ${lines.name}, ${lines.meta}`}
      role="img"
    >
      <BarcodeSvg
        value={content.barcode}
        onStateChange={onBarcodeState}
        svgRef={svgRef}
        className="shrink-0"
        style={{ height: mm(m.barsHeight) }}
      />
      <div style={{ ...text, fontSize: mm(m.digitsSize), letterSpacing: "0.08em", marginTop: mm(0.4) }} aria-hidden>
        {lines.digits}
      </div>
      <div style={{ ...text, fontSize: mm(m.nameSize), fontWeight: 700 }} aria-hidden>
        {lines.name}
      </div>
      <div style={{ ...text, fontSize: mm(m.metaSize) }} aria-hidden>
        {lines.meta}
      </div>
    </div>
  );
}
