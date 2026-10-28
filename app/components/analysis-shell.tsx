"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMarketData } from "./market-data";
import { ASSETS } from "../../lib/correlations";
import { SERIES_COLORS } from "../../lib/chart-settings";

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const percent = (value: number | null) =>
  value === null
    ? "—"
    : `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value).toFixed(2)}%`;
export const assetStatus = (status: string) =>
  status === "error"
    ? "Could not load data"
    : status === "unavailable"
      ? "Data unavailable"
      : "Insufficient data";

export function AssetName({ id, name }: { id: string; name: string }) {
  return (
    <span className="asset-name">
      <span
        className="series-swatch"
        style={{ borderColor: SERIES_COLORS[id] }}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}

export function Methodology({ children }: { children: ReactNode }) {
  return (
    <section id="how-it-works" className="methodology">
      <div className="method-intro">
        <h2>How it works</h2>
        <p>
          Daily observations.
          <br />A little context for the numbers.
        </p>
      </div>
      <div className="method-copy">
        {children}
        <article>
          <h3>The data has limits.</h3>
          <p>
            Source:{" "}
            <a
              className="inline-link"
              href="https://hyperliquid.xyz"
              target="_blank"
              rel="noreferrer"
            >
              Hyperliquid
            </a>{" "}
            perpetual markets: BTC, xyz:GOLD, xyz:DXY, xyz:SP500, and
            xyz:BRENTOIL. These are perpetual market proxies, not official index
            or spot feeds. Only completed UTC daily candles with valid positive
            prices are used. Missing observations stay gaps. Price returns
            exclude funding, fees, and dividends.
          </p>
          <p className="method-detail">
            Hover or tap to inspect a date. Toggle assets in the legend. On
            touch screens, swipe to scroll or enable Zoom to select a region.
            Reset restores the full chart.
          </p>
        </article>
      </div>
    </section>
  );
}

export default function AnalysisShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { data, loading, failed, load } = useMarketData();
  const errors = data?.assets.some((a) => a.status === "error");
  return (
    <div className="site-wrap">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" href="/correlations">
          Quant Wannabe.
        </Link>
        <nav aria-label="Analysis pages">
          {[
            ["/correlations", "Correlations"],
            ["/performance", "Performance"],
            ["/risk", "Risk"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <a className="how-link" href="#how-it-works">
          How it works <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="intro">
          <h1>{title}</h1>
          <p>{description}</p>
        </section>
        {(loading || failed || errors) && (
          <div
            className={`data-notice ${failed ? "has-error" : ""}`}
            role={failed || errors ? "alert" : "status"}
          >
            {loading
              ? "Fetching daily history from Hyperliquid…"
              : failed
                ? "Market data could not be loaded from Hyperliquid."
                : "Some markets could not be loaded. The available lines are shown."}
            {!loading && (failed || errors) && (
              <button className="text-button" onClick={() => void load()}>
                Try again
              </button>
            )}
          </div>
        )}
        {!loading &&
          !failed &&
          data &&
          data.assets.some((a) => a.status !== "available") && (
            <p className="market-status" role="status">
              {data.assets
                .filter((a) => a.status !== "available")
                .map(
                  (a) =>
                    `${ASSETS.find((asset) => asset.id === a.id)!.name}: ${assetStatus(a.status)}`,
                )
                .join(". ")}
              .
            </p>
          )}
        {children}
      </main>
      <footer className="site-footer">
        <p>
          A small study in market behaviour.
          <br />
          The numbers have history. No crystal ball.
        </p>
        <p className="update-time">
          {data && !failed ? (
            <>
              Data fetched{" "}
              {new Date(data.updatedAt).toLocaleString("en-GB", {
                timeZone: "UTC",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}{" "}
              UTC
              <br />
              Cached for up to 15 minutes. No live polling.
            </>
          ) : (
            "Daily market analysis from Hyperliquid."
          )}
        </p>
      </footer>
    </div>
  );
}
