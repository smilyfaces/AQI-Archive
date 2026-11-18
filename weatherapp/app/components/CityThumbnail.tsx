import Image from "next/image";

type ThumbnailProp = {
    imageUrl : string;
    name : string;
    aqi : number;
    pollutant : string;
    concentration: number;
    level : string;
}

export default function CityThumbnail({imageUrl, name, aqi, pollutant, concentration, level} : ThumbnailProp){
    return (
        <div className="rounded-lg border border-line w-fit p-4 bg-surface text-ink">
            <Image src={imageUrl} alt="" width={320} height={180} unoptimized className="rounded-lg" />
            <h1>{name}</h1>
            <h1>AQI: {aqi}</h1>
            <h1>Primary Pollutant: {pollutant}</h1>
            <h1>Concentration: {concentration} µg/m³</h1>
            <h1>{level}</h1>
        </div>
    );
}