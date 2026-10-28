import { getCities } from "@/lib/data";
import { SavedDashboard } from "@/components/SavedDashboard";
export const revalidate=300;
export default async function SavedPage(){const result=await getCities();return <SavedDashboard {...result}/>;}
