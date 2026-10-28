import { z } from "zod";
import { getCity } from "@/lib/data";

const querySchema=z.object({slugs:z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(10),days:z.coerce.number().int().min(1).max(3650).default(30)});
export const dynamic="force-dynamic";
export async function GET(request:Request){const url=new URL(request.url);const parsed=querySchema.safeParse({slugs:url.searchParams.getAll("slug"),days:url.searchParams.get("days")??30});if(!parsed.success)return Response.json({error:"Choose one to ten valid saved cities and a time range from 1 to 3650 days."},{status:400});const cutoff=Date.now()-parsed.data.days*86_400_000;const results=await Promise.all(parsed.data.slugs.map(async slug=>{const result=await getCity(slug);return {slug,readings:result.readings.filter(row=>Date.parse(row.recorded_at)>=cutoff),error:result.error};}));return Response.json({cities:results},{headers:{"Cache-Control":"private, no-store"}});}
