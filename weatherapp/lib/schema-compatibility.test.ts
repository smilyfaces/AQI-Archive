import { describe, expect, it } from "vitest";
import { isMissingOptionalCityAnalysisColumn } from "@/lib/schema-compatibility";

describe("optional city analysis schema compatibility", () => {
  it("recognizes Postgres missing-column and PostgREST schema-cache errors", () => {
    expect(isMissingOptionalCityAnalysisColumn({ code: "42703", message: "column cities.region does not exist" })).toBe(true);
    expect(isMissingOptionalCityAnalysisColumn({ code: "PGRST204", message: "Could not find the 'climate_type' column in the schema cache" })).toBe(true);
  });

  it("does not hide missing required columns or unrelated database errors", () => {
    expect(isMissingOptionalCityAnalysisColumn({ code: "42703", message: "column cities.name does not exist" })).toBe(false);
    expect(isMissingOptionalCityAnalysisColumn({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isMissingOptionalCityAnalysisColumn(null)).toBe(false);
  });
});
