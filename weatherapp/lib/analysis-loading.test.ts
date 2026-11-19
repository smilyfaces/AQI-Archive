import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { analysisPeriods, defaultInsightsPeriod } from "./analysis-periods";
import { getAllReadings } from "./data";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("limits the default Insights query to 24 hours and allows an all-time query", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
  const query = {
    select: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const from = vi.fn((table: string) => table === "readings" ? query : {
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  vi.mocked(createClient).mockReturnValue({ from } as unknown as ReturnType<typeof createClient>);

  const defaultPeriod = analysisPeriods.find(item => item.key === defaultInsightsPeriod)!;
  await getAllReadings(defaultPeriod.duration);
  expect(query.gte).toHaveBeenCalledWith("recorded_at", "2026-11-17T15:00:00.000Z");
  expect(query.lte).toHaveBeenCalledWith("recorded_at", "2026-11-18T15:00:00.000Z");

  query.gte.mockClear();
  await getAllReadings();
  expect(query.gte).not.toHaveBeenCalled();
});
