const dayMs = 24 * 60 * 60 * 1000;

export const analysisPeriods = [
  { key: "24h", label: "24 hours", duration: dayMs },
  { key: "7d", label: "7 days", duration: 7 * dayMs },
  { key: "30d", label: "30 days", duration: 30 * dayMs },
  { key: "90d", label: "90 days", duration: 90 * dayMs },
  { key: "all", label: "All time", duration: Infinity },
] as const;

export type AnalysisPeriod = (typeof analysisPeriods)[number]["key"];
export const defaultInsightsPeriod = "24h" satisfies AnalysisPeriod;
