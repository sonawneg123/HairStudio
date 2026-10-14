/**
 * Shared formatting helpers for public-facing service display.
 * Pure functions — no side effects, no imports.
 */

/**
 * Formats a numeric price (as string from DB) in INR using the Indian locale.
 * Example: "350.00" → "₹350.00"
 */
export function formatPriceINR(price: string): string {
  const amount = parseFloat(price);
  if (Number.isNaN(amount)) return price;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats duration minutes as a human-readable string.
 * Examples: 45 → "45 min", 90 → "1 hr 30 min", 60 → "1 hr"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}
