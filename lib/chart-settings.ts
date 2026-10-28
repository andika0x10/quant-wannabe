/** Shared visual settings for every analysis chart, legend, and reading. */
export const SERIES_LINE_WIDTH = 1.25;
export const SERIES_COLORS: Record<string, string> = {
  btc: "#2563eb",
  gold: "#b77900",
  dxy: "#7c3aed",
  sp500: "#15803d",
  oil: "#dc2626",
};

export const ROLLING_WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;
