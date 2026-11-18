import type { Metadata } from "next";
import { Instrument_Sans, Fraunces } from "next/font/google";
import { SavedCitiesProvider } from "@/components/SavedCitiesProvider";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const instrument = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-editorial",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Airwise · City air quality", template: "%s · Airwise" },
  description: "Hourly air quality and weather readings for US cities, with honest archives and analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrument.variable} ${fraunces.variable}`} data-scroll-behavior="smooth">
      <body>
        <SavedCitiesProvider>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <AppHeader />
          {children}
          <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><span className="brand-mark small"><span>air</span></span><span>Airwise</span></div><p>Weather from the National Weather Service. Air quality from EPA AirNow and OpenAQ. Readings come from nearby monitors and may differ from a specific address. AirNow data are preliminary. Not medical advice.</p></div></footer>
        </SavedCitiesProvider>
      </body>
    </html>
  );
}
