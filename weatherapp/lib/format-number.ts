const displayNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  roundingMode: "trunc",
  signDisplay: "negative",
});

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "N/A" : displayNumber.format(value);
}

export function formatPValue(value: number | null | undefined): string {
  return value != null && value > 0 && value < 0.01 ? "< 0.01" : formatNumber(value);
}
