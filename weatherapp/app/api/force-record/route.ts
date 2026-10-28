import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cityCatalog } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  password: z.string().min(1).max(512),
  slugs: z.array(z.string().min(1).max(100)).max(cityCatalog.length).optional(),
}).strict();

function matchesPassword(candidate: string, expected: string) {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export async function POST(request: Request) {
  const password = process.env.PASSWORD;
  if (!password) return Response.json({ error: "Force recording is not configured on the server." }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (!matchesPassword(parsed.data.password, password)) return Response.json({ error: "Incorrect password." }, { status: 401 });

  const slugs = parsed.data.slugs;
  if (slugs) {
    const allowed = new Set(cityCatalog.map(city => city.slug));
    const uniqueSlugs = [...new Set(slugs)];
    if (!uniqueSlugs.length || uniqueSlugs.some(slug => !allowed.has(slug))) {
      return Response.json({ error: "Choose at least one valid tracked city." }, { status: 400 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ingestSecret = process.env.INGEST_SECRET;
  if (!supabaseUrl || !ingestSecret) return Response.json({ error: "Force recording is missing its server configuration." }, { status: 503 });

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ingestSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(slugs ? { slugs: [...new Set(slugs)] } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return Response.json({ error: "The ingestion service could not complete the recording." }, { status: 502 });
    }
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Could not reach the ingestion service. Try again shortly." }, { status: 502 });
  }
}
