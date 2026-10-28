"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ASSETS,
  rollingCorrelation,
  cumulativeReturns,
  strength,
  type CorrelationData,
} from "../../lib/correlations";
import TimelinePlot from "./timeline-plot";
import MathFormula from "./math-formula";
import { ROLLING_WINDOWS, SERIES_COLORS } from "../../lib/chart-settings";

const number = (value: number) =>
  `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default function CorrelationDashboard() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [window, setWindow] = useState(90);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/correlations", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load");
      const result = (await response.json()) as CorrelationData;
      if (!signal?.aborted) setData(result);
    } catch {
      if (!signal?.aborted) setFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const rolling = useMemo(
    () =>
      data
        ? data.assets
            .filter((a) => a.status === "available")
            .map((a) => ({
              id: a.id,
              name: ASSETS.find((asset) => asset.id === a.id)!.name,
              points: rollingCorrelation(
                data.btc,
                a.candles,
                window,
                new Date(data.updatedAt).getTime(),
              ),
            }))
        : [],
    [data, window],
  );
  const cumulative = useMemo(
    () => (data ? cumulativeReturns(data) : []),
    [data],
  );
  const usableRolling = useMemo(
    () => rolling.filter((s) => s.points.some((p) => p.value !== null)),
    [rolling],
  );
  const ready = !loading && !failed && !!data;
  const shared = cumulative[0]?.points;
  const errors = data?.assets.some((a) => a.status === "error");

  return (
    <div className="site-wrap">
      <header className="site-header">
        <a className="brand" href="/">
          Quant Wannabe.
        </a>
        <a className="how-link" href="#how-it-works">
          How it works <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main>
        <section className="intro">
          <h1>Does Bitcoin have anything in common?</h1>
          <p>A small study in moving together. Or politely disagreeing.</p>
        </section>
        {(!ready || errors) && (
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
        <section className="relationship" aria-labelledby="rolling-title">
          <div className="chart-toolbar">
            <div>
              <h2 id="rolling-title">Rolling correlation</h2>
              <p>Bitcoin vs. Gold, DXY, S&P 500, and Oil. All in one place.</p>
            </div>
            <div className="window-control">
              <span>Rolling window</span>
              <div
                className="period-switch"
                role="group"
                aria-label="Rolling window"
              >
                {ROLLING_WINDOWS.map(({ days, label }) => (
                  <button
                    key={days}
                    aria-pressed={window === days}
                    className={window === days ? "active" : ""}
                    onClick={() => setWindow(days)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {ready && usableRolling.length > 0 ? (
            <TimelinePlot series={usableRolling} kind="rolling" />
          ) : (
            <div className="chart-empty" role="status">
              <p>
                {loading
                  ? "Finding common ground…"
                  : failed
                    ? "The data didn’t make it."
                    : `Not enough history for a complete ${window}-day window. Try 30 days.`}
              </p>
            </div>
          )}
          <div className="chart-footnote">
            <span>
              Trailing {window} consecutive daily returns per point · Full
              available history · UTC
            </span>
            <span>Signed Pearson r, from −1 to +1</span>
          </div>
          <div
            className="latest-readings"
            aria-label="Latest rolling correlations"
          >
            {ASSETS.map((asset) => {
              const state = data?.assets.find((a) => a.id === asset.id);
              const latest = rolling
                .find((s) => s.id === asset.id)
                ?.points.at(-1);
              const r = ready ? latest?.value : null;
              return (
                <div className="latest-reading" key={asset.id}>
                  <span
                    className={`series-swatch swatch-${asset.id}`}
                    style={{ borderColor: SERIES_COLORS[asset.id] }}
                    aria-hidden="true"
                  />
                  <div>
                    <h3>{asset.name}</h3>
                    <p>
                      {loading ? (
                        "Loading…"
                      ) : failed || state?.status === "error" ? (
                        "Could not load data"
                      ) : state?.status !== "available" ? (
                        "Data unavailable"
                      ) : r == null ? (
                        "Insufficient data"
                      ) : (
                        <>
                          <strong>{number(r)}</strong> {strength(r)} ·{" "}
                          {r < 0
                            ? "Opposite directions"
                            : r === 0
                              ? "No linear direction"
                              : "Same direction"}
                        </>
                      )}
                    </p>
                    {ready && latest?.value != null && (
                      <span className="reading-date">
                        Window ending {date(latest.date)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section
          className="cumulative-section"
          aria-labelledby="cumulative-title"
        >
          <div className="chart-toolbar">
            <div>
              <h2 id="cumulative-title">Cumulative return</h2>
              <p>Same starting line. Very different journeys.</p>
            </div>
            <span className="baseline-label">Starting value = 1×</span>
          </div>
          {ready && cumulative.length > 0 ? (
            <TimelinePlot series={cumulative} kind="cumulative" />
          ) : (
            <div className="chart-empty" role="status">
              <p>
                {loading
                  ? "Preparing the starting line…"
                  : "No shared price history available."}
              </p>
            </div>
          )}
          <div className="chart-footnote">
            <span>
              {ready && shared?.length
                ? `Common start: ${date(shared[0].date)} · Through ${date(shared.at(-1)!.date)} (UTC)`
                : "All available assets share one starting date"}
            </span>
            <span>
              Source:{" "}
              <a
                href="https://hyperliquid.xyz"
                target="_blank"
                rel="noreferrer"
              >
                Hyperliquid ↗
              </a>
            </span>
          </div>
        </section>
        <section id="how-it-works" className="methodology">
          <div className="method-intro">
            <h2>
              A little method
              <br />
              to the madness.
            </h2>
            <p>
              Strong means linear.
              <br />
              Negative just means opposite directions.
            </p>
          </div>
          <div className="method-copy">
            <article>
              <h3>A relationship with a history.</h3>
              <p>
                Each point is Pearson’s correlation of the previous {window}{" "}
                daily percentage returns. Every window needs {window}{" "}
                consecutive paired UTC days. Missing prices or constant returns
                leave a gap. The sign shows direction; strength uses{" "}
                <MathFormula tex={String.raw`|r|`} />: strong{" "}
                <MathFormula tex={String.raw`\geq 0.70`} />, moderate{" "}
                <MathFormula tex={String.raw`\geq 0.40`} />, otherwise weak.
              </p>
              <MathFormula
                display
                tex={String.raw`r_t = \frac{\operatorname{cov}(R_{\mathrm{BTC}},\,R_A)}{\sigma_{\mathrm{BTC}}\,\sigma_A}`}
              />
              <p className="formula-note">
                Covariance and standard deviations are calculated inside each
                trailing window.
              </p>
              <MathFormula
                display
                tex={String.raw`R_{A,t} = \left(\frac{P_{A,t}}{P_{A,t-1}} - 1\right)\!\times 100\%`}
              />
              <p className="formula-note">
                <MathFormula tex="P_{A,t}" /> is asset A’s daily closing price;{" "}
                <MathFormula tex="R_{A,t}" /> is its daily percentage return.
              </p>
            </article>
            <article>
              <h3>One starting line.</h3>
              <p>
                Each cumulative line is its closing price divided by its price
                on the first date shared by all available assets. Every line
                starts at 1×; 1.20× means a 20% gain. This is price performance,
                without funding, fees, or dividends. Missing prices stay gaps.
              </p>
              <MathFormula
                display
                tex={String.raw`G_{A,t} = \frac{P_{A,t}}{P_{A,t_0}},\qquad G_{A,t_0}=1`}
              />
              <p className="formula-note">
                <MathFormula tex="t_0" /> is the first date shared by all
                available assets.
              </p>
            </article>
            <article>
              <h3>Only as far back as the data goes.</h3>
              <p>
                We use the full retained daily history from Hyperliquid
                perpetual markets: BTC, xyz:GOLD, xyz:DXY, xyz:SP500, and
                xyz:BRENTOIL. Oil uses Brent crude. These are perpetual market
                proxies, not official index or spot feeds. Listings start on
                different dates, so rolling lines can start later and
                unavailable markets stay empty.
              </p>
              <p className="method-detail">
                Hover or tap to compare a date. Use the legend to toggle lines.
                On a phone, swipe vertically to scroll; tap Zoom to select a
                chart region. Reset restores the full history and scrolling.
              </p>
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <p>
          Correlation does not imply causation.
          <br />
          Or a promising career in finance.
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
            "A casual look at a linear relationship."
          )}
        </p>
      </footer>
    </div>
  );
}
