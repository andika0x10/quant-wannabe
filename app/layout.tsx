import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { MarketProvider } from "./components/market-data";

export const metadata: Metadata = {
  title: { default: "Quant Wannabe", template: "%s | Quant Wannabe" },
  description:
    "Explore Bitcoin’s rolling correlations and cumulative returns alongside Gold, DXY, S&P 500, and Brent Oil using Hyperliquid data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          rel="preload"
          href="/fonts/space-grotesk.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/instrument-sans.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <MarketProvider>{children}</MarketProvider>
      </body>
    </html>
  );
}
