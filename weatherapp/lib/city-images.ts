export type CityImage = { src: string; alt: string; credit: string; license: string; sourceUrl: string };

export const cityImages: Partial<Record<string, CityImage>> = {
  "columbia-sc": {
    src: "/cities/columbia-sc.webp",
    alt: "Columbia skyline viewed from West Columbia",
    credit: "Runner1928",
    license: "CC0 1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Columbia,_South_Carolina,_skyline.jpg",
  },
  "oakland-ca": {
    src: "/cities/oakland-ca.webp",
    alt: "Downtown Oakland from Lake Merritt",
    credit: "Daniel Ramirez",
    license: "CC BY 2.0",
    sourceUrl: "https://www.flickr.com/photos/21442511@N08/2917912282",
  },
  "lamont-ok": {
    src: "/cities/lamont-ok.webp",
    alt: "Wheat near Muskogee, a representative rural Oklahoma landscape",
    credit: "Russell Lee, Library of Congress",
    license: "Public domain in the United States",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Wheat_near_Muskogee,_Oklahoma1a34089v.jpg",
  },
};
