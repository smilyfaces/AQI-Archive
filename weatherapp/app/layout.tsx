import type { Metadata } from "next";
import { Figtree, Outfit } from "next/font/google";
import { SavedCitiesProvider } from "@/components/SavedCitiesProvider";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Airwise · City air quality", template: "%s · Airwise" },
  description: "Hourly air quality and weather readings for US cities, with honest archives and analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.variable} ${outfit.variable}`} data-scroll-behavior="smooth">
      <body>
        <SavedCitiesProvider>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <AppHeader />
          {children}
          <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><span className="brand-mark small"><span>air</span></span><span>Airwise</span></div><p>Weather from the National Weather Service. Air quality from EPA AirNow and OpenAQ. Readings come from nearby monitors and may differ from a specific address. AirNow data are preliminary. Not medical advice.</p><span className="footer-note">Made for clearer days.</span></div></footer>
        </SavedCitiesProvider>
      </body>
    </html>
  );
}
