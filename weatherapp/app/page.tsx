import { Suspense } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { getCities } from "@/lib/data";

export const revalidate = 300;

export default async function Home() {
  const data = await getCities();
  return (
    <main id="main-content" className="page-main">
      <Suspense fallback={<div className="page-container city-list" role="status" aria-label="Loading cities">{Array.from({ length: 4 }, (_, index) => <div className="skeleton city-row-skeleton" key={index} />)}</div>}>
        <HomeDashboard {...data} />
      </Suspense>
    </main>
  );
}
