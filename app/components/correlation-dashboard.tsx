"use client";

import { useMemo, useState } from "react";
import { ASSETS, rollingCorrelation, strength } from "../../lib/correlations";
import AnalysisShell from "./analysis-shell";
import { useMarketData } from "./market-data";
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
  const { data, loading, failed, ready } = useMarketData();
  const [window, setWindow] = useState(90);
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
  const usableRolling = useMemo(
    () => rolling.filter((s) => s.points.some((p) => p.value !== null)),
    [rolling],
  );
  return (
    <AnalysisShell
      title="Bitcoin correlations"
      description="Does Bitcoin have anything in common? A small study in moving together."
    >
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
              Each point is Pearson’s correlation of the previous {window} daily
              percentage returns. Every window needs {window} consecutive paired
              UTC days. Missing prices or constant returns leave a gap. The sign
              shows direction; strength uses{" "}
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
            <h3>Only as far back as the data goes.</h3>
            <p>
              We use the full retained daily history from Hyperliquid perpetual
              markets: BTC, xyz:GOLD, xyz:DXY, xyz:SP500, and xyz:BRENTOIL. Oil
              uses Brent crude. These are perpetual market proxies, not official
              index or spot feeds. Price returns exclude funding, fees, and
              dividends. Listings start on different dates, so rolling lines can
              start later and unavailable markets stay empty.
            </p>
            <p className="method-detail">
              Hover or tap to compare a date. Use the legend to toggle lines. On
              a phone, swipe left or right to explore the chart.
            </p>
          </article>
        </div>
      </section>
    </AnalysisShell>
  );
}
