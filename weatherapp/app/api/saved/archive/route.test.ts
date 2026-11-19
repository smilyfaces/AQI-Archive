import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArchive } from "@/lib/data";
import { POST } from "./route";

vi.mock("@/lib/data", () => ({ getArchive: vi.fn() }));

const request = (slugs: string[]) => new Request("http://localhost/api/saved/archive", {
  method: "POST",
  body: JSON.stringify({ slugs }),
});

describe("saved archive export", () => {
  const archive = vi.mocked(getArchive);

  beforeEach(() => archive.mockReset());

  it("exports each city once and includes later pages and manual observations", async () => {
    archive.mockImplementation(async (slug, filters, options) => {
      const page = filters?.page ?? 1;
      const pageSize = options?.pageSize ?? 50;
      const total = slug === "oakland-ca" ? pageSize + 1 : 1;
      const count = Math.min(pageSize, total - (page - 1) * pageSize);
      return {
        city: { slug, name: slug, state: "CA", latest: null },
        rows: Array.from({ length: count }, () => ({
          recorded_at: "2026-10-22T13:57:00.000Z",
          source: "manual",
          aqi: page === 1 ? 10 : 99,
        })),
        total, error: null, page, localFallback: false,
      } as Awaited<ReturnType<typeof getArchive>>;
    });

    const response = await POST(request(["oakland-ca", "oakland-ca", "lamont-ok"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("saved-cities-archive.csv");
    const csv = await response.text();
    expect(csv).toContain('"recorded_at","source","aqi"');
    expect(csv).toContain('"manual",99');
    expect(csv).toContain('"lamont-ok"');
    expect(archive).toHaveBeenCalledTimes(3);
    expect(archive.mock.calls.every(([, , options]) => options?.before === archive.mock.calls[0][2]?.before)).toBe(true);
  });

  it("rejects invalid cities and returns an error instead of a partial download", async () => {
    expect((await POST(request(["../invalid"]))).status).toBe(400);
    expect(archive).not.toHaveBeenCalled();
    archive.mockRejectedValueOnce(new Error("unavailable"));
    const response = await POST(request(["oakland-ca"]));
    expect(response.status).toBe(502);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
