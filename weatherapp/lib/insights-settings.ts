import type { AnalysisPeriod } from "@/lib/analysis-periods";
import type { MetricKey } from "@/lib/metrics";

export const groupModes = ["pollutant", "precipitation", "cloud", "temperature", "humidity"] as const;
export const weatherBins = ["temp_bin", "wind_bin", "rh_bin", "cloud_bin", "pressure_bin"] as const;
export type AnalysisSelection = {
  period: AnalysisPeriod;
  includeManual: boolean;
  sampleSize: number | null;
  sampleSeed: number;
};
export type ReportSettings = {
  metric: MetricKey;
  groupMode: (typeof groupModes)[number];
  gridX: (typeof weatherBins)[number];
  gridY: (typeof weatherBins)[number];
  correlationMethod: "pearson" | "spearman";
};
export const defaultReportSettings: ReportSettings = {
  metric: "aqi",
  groupMode: "pollutant",
  gridX: "temp_bin",
  gridY: "wind_bin",
  correlationMethod: "pearson",
};

export type ChartSettings = {
  type: "series" | "distribution" | "scatter" | "rolling";
  metric: MetricKey;
  xMetric: MetricKey;
  window: "short" | "long" | "both";
  page?: number;
};

export type InsightsSource = { asOf: number; slug?: string; days?: number; archivePeriod?: AnalysisPeriod };

export const chartTablePageSize = 100;
