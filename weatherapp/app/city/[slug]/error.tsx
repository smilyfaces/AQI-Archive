"use client";

export default function CityError({reset}:{error:Error & {digest?:string};reset:()=>void}) {
  return <main id="main-content" className="page-main"><div className="page-container"><div className="error-panel" role="alert"><div><strong>City data could not load.</strong><span>Retry the request to load this city and its archive.</span></div><button className="button secondary" onClick={()=>reset()}>Try again</button></div></div></main>;
}
