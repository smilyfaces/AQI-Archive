import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

const makeRequest = (body: unknown) => new Request("http://localhost/api/force-record", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/force-record", () => {
  it("requires the server password to be configured", async () => {
    vi.stubEnv("PASSWORD", "");
    const response = await POST(makeRequest({ password: "anything" }));
    expect(response.status).toBe(503);
  });

  it("rejects an incorrect password", async () => {
    vi.stubEnv("PASSWORD", "correct horse battery staple");
    const response = await POST(makeRequest({ password: "wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects untracked city slugs even with the right password", async () => {
    vi.stubEnv("PASSWORD", "correct horse battery staple");
    const response = await POST(makeRequest({ password: "correct horse battery staple", slugs: ["not-a-city"] }));
    expect(response.status).toBe(400);
  });
});
