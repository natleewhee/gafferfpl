import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#06090f",
};

/* Three voices: an editorial grotesk for reading, a condensed broadcast face
 * for scores and headings, and a mono for tabular data. */
const ui = Schibsted_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
});

const display = Barlow_Condensed({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
});

const data = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
});

const DESCRIPTION = "Your FPL captain pick, transfer plans and live rank, on your phone. Type your team ID and go.";

/* Absolute URLs for the share card (opengraph-image.tsx). On Vercel production that is the fixed
 * production domain; on previews the preview's own address; locally, localhost. */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === "production"
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "GafferFPL",
  description: DESCRIPTION,
  appleWebApp: { capable: true, title: "GafferFPL", statusBarStyle: "black" },
  openGraph: { type: "website", siteName: "GafferFPL", title: "GafferFPL", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "GafferFPL", description: DESCRIPTION },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${ui.variable} ${display.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
