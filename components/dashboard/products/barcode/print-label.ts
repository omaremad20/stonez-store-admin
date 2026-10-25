import { labelLines, labelMetrics, type LabelContent } from "@/components/dashboard/products/barcode/barcode-label";

/**
 * Prints ONE barcode label in an isolated, off-screen iframe.
 *
 * Nothing from the dashboard (sidebar, dialog, table, styles) is in that
 * document, so only the label can print. `@page` sets the sheet to the label
 * size with zero margins; the label box is exactly that size and can't break
 * across pages. The bars are the already-rendered SVG markup, so no network,
 * script or font is needed inside the frame before printing.
 */

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const mm = (value: number) => `${value.toFixed(2)}mm`;

export function buildLabelDocument(content: LabelContent, svgMarkup: string): string {
  const m = labelMetrics();
  const lines = labelLines(content);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(lines.digits)}</title>
<style>
  @page { size: ${mm(m.width)} ${mm(m.height)}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${mm(m.width)}; height: ${mm(m.height)}; overflow: hidden; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  .label {
    width: ${mm(m.width)}; height: ${mm(m.height)};
    padding: ${mm(m.paddingY)} ${mm(m.paddingX)};
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    break-inside: avoid; page-break-inside: avoid; overflow: hidden;
    font-family: Arial, Helvetica, sans-serif; color: #000;
  }
  .label svg { display: block; width: 100%; height: ${mm(m.barsHeight)}; flex-shrink: 0; }
  .line { width: 100%; text-align: center; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .digits { font-size: ${mm(m.digitsSize)}; letter-spacing: 0.08em; margin-top: ${mm(0.4)}; }
  .name { font-size: ${mm(m.nameSize)}; font-weight: 700; }
  .meta { font-size: ${mm(m.metaSize)}; }
</style>
</head>
<body>
  <div class="label">
    ${svgMarkup}
    <div class="line digits">${escapeHtml(lines.digits)}</div>
    <div class="line name">${escapeHtml(lines.name)}</div>
    <div class="line meta">${escapeHtml(lines.meta)}</div>
  </div>
</body>
</html>`;
}

export class LabelPrintError extends Error {}

const nextFrame = (win: Window) => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));

/**
 * Resolves once the browser's print dialog has closed — whether the user
 * printed or cancelled (browsers don't tell pages which). Callers ask the
 * admin to confirm before recording anything as printed.
 */
export function printLabelDocument(html: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const m = labelMetrics();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.title = "Barcode label print frame";
    // Off-screen but laid out at the label size (some browsers print hidden frames blank).
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: mm(m.width),
      height: mm(m.height),
      border: "0",
    });

    let settled = false;
    let fallbackTimer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("focus", onParentFocus);
      // Give the print pipeline a moment before the frame disappears.
      window.setTimeout(() => iframe.remove(), 1000);
      if (error) reject(error);
      else resolve();
    };
    const onParentFocus = () => window.setTimeout(() => finish(), 250);

    iframe.onload = async () => {
      const win = iframe.contentWindow;
      if (!win) {
        finish(new LabelPrintError("The label couldn't be prepared for printing."));
        return;
      }
      try {
        await win.document.fonts?.ready;
      } catch {
        // System fonts only — nothing to wait for.
      }
      await nextFrame(win);
      await nextFrame(win);

      win.addEventListener("afterprint", () => finish(), { once: true });
      const startedAt = Date.now();
      try {
        win.focus();
        win.print();
      } catch {
        finish(new LabelPrintError("The browser blocked printing. Allow printing for this site and try again."));
        return;
      }
      // Browsers whose print() blocks until the dialog closes: we're done now.
      if (Date.now() - startedAt > 400) {
        finish();
        return;
      }
      // Non-blocking print(): afterprint, or focus returning to the dashboard.
      window.addEventListener("focus", onParentFocus);
      fallbackTimer = window.setTimeout(() => finish(), 120_000);
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
