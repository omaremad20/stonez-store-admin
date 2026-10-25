/** Display helpers shared by the products listing, details and barcode label. */

/** Store currency (Stonez Store, Cairo). Change here to re-label every price. */
const priceFormatter = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number): string {
  return Number.isFinite(value) ? priceFormatter.format(value) : "—";
}

/** `discount` is a percentage (0–99). */
export function discountedPrice(price: number, discount: number): number {
  return Math.round(price * (1 - discount / 100) * 100) / 100;
}

const numberFormatter = new Intl.NumberFormat("en-US");
export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? { short: "—", full: "" }
    : { short: dateFormatter.format(date), full: dateTimeFormatter.format(date) };
}

/** Label rule: only the first two words of the product name. */
export function labelProductName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

export function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}
