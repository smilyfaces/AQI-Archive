import Image from "next/image";
import CityThumbnail from "./components/CityThumbnail";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <CityThumbnail key={1} imageUrl="https://media.cntraveler.com/photos/5b9965e47009626e21e1e1aa/1:1/w_2992,h_2992,c_limit/Oakland_GettyImages-895763946.jpg" name="Oakland" aqi={24} pollutant="PM2.5" concentration={4.3} level="good"/>
      </main>
    </div>
  );
}
