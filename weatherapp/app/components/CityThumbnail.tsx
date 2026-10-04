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
        <div className=" rounded-lg border-slate-400 border w-fit p-4 bg-slate-900 ">
            <img src={imageUrl} className="rounded-lg"></img>
            <h1>{name}</h1>
            <h1>AQI: {aqi}</h1>
            <h1>Primary Pollutant: {pollutant}</h1>
            <h1>Concentration: {concentration} µg/m³</h1>
            <h1>{level}</h1>
        </div>
    );
}