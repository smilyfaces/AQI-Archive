import { HomeDashboard } from "@/components/HomeDashboard";
import { getCities } from "@/lib/data";

export const revalidate = 300;

export default async function Home() {
  const data = await getCities();
  return <HomeDashboard {...data} />;
}
