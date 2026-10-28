"use client";

import { useMemo, useState } from "react";
import {
  markets,
  monthlyReturns,
  performance,
} from "../../lib/market-analysis";
import { ROLLING_WINDOWS } from "../../lib/chart-settings";
import AnalysisShell, {
  AssetName,
  Methodology,
  assetStatus,
  formatDate,
  percent,
} from "./analysis-shell";
import { useMarketData } from "./market-data";
import TimelinePlot from "./timeline-plot";
import MathFormula from "./math-formula";

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function PerformanceDashboard() {
  const { data, ready, loading, failed } = useMarketData();
  const [days, setDays] = useState<number | null>(null);
  const result = useMemo(
    () => (data ? performance(data, days) : null),
    [data, days],
  );
  const years = useMemo(() => (data ? monthlyReturns(data) : []), [data]);
  const inputs = useMemo(() => (data ? markets(data) : []), [data]);
  const ranking = result?.ranking ?? [];
  const unranked = inputs.filter((m) => !ranking.some((r) => r.id === m.id));
  return (
    <AnalysisShell
      title="Market performance"
      description="Same starting line. Very different journeys."
    >
      <section aria-labelledby="cumulative-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="cumulative-title">Cumulative return</h2>
            <p>Bitcoin, Gold, DXY, S&P 500, and Oil. Rebased to 1×.</p>
          </div>
          <div className="window-control">
            <span>Period</span>
            <div
              className="period-switch"
              role="group"
              aria-label="Performance period"
            >
              {[...ROLLING_WINDOWS, { days: null, label: "All" }].map(
                (period) => (
                  <button
                    key={period.label}
                    aria-pressed={days === period.days}
                    className={days === period.days ? "active" : ""}
                    onClick={() => setDays(period.days)}
                  >
                    {period.label}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
        {ready && result?.series.length ? (
          <TimelinePlot series={result.series} kind="cumulative" />
        ) : (
          <div className="chart-empty" role="status">
            <p>
              {loading
                ? "Preparing the starting line…"
                : failed
                  ? "Market data could not be loaded."
                  : "Not enough shared price history for this period. Try All."}
            </p>
          </div>
        )}
        <div className="chart-footnote">
          <span>
            {ready && result?.start && result.end
              ? `Actual range: ${formatDate(result.start)} – ${formatDate(result.end)} (UTC)`
              : "Available assets share the same start and end dates"}
          </span>
          <span>Price performance · Starting value = 1×</span>
        </div>
      </section>
      <section className="analysis-section" aria-labelledby="ranking-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="ranking-title">Return ranking</h2>
            <p>Same dates as the chart. Highest return first.</p>
          </div>
        </div>
        {ready ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Return ranking table"
            tabIndex={0}
          >
            <table className="analysis-table">
              <caption className="sr-only">
                Asset returns over the selected shared date range
              </caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col">Return</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <AssetName id={r.id} name={r.name} />
                    </th>
                    <td>{percent(r.value)}</td>
                    <td>Available</td>
                  </tr>
                ))}
                {unranked.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <AssetName id={m.id} name={m.name} />
                    </th>
                    <td>—</td>
                    <td>{assetStatus(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="section-notice">
            {loading
              ? "Loading returns…"
              : "Load market data to compare returns."}
          </p>
        )}
      </section>
      <section className="analysis-section" aria-labelledby="monthly-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="monthly-title">Monthly returns</h2>
            <p>
              Full history, grouped by year. Completed calendar months only.
            </p>
          </div>
          <span className="heatmap-key">
            <span>Loss</span>
            <span className="heatmap-scale" aria-hidden="true" />
            <span>Gain</span>
          </span>
        </div>
        <p className="table-hint">
          Swipe the table horizontally to see all months.
        </p>
        <p className="section-notice">
          Signed price returns in %. A dash means unavailable data or an
          unfinished month. Colour saturates at ±20%.
        </p>
        {ready && years.length ? (
          years.map(({ year, rows }) => (
            <div className="heatmap-year" key={year}>
              <h3>{year}</h3>
              <div
                className="table-scroll"
                role="region"
                aria-label={`${year} monthly returns`}
                tabIndex={0}
              >
                <table className="analysis-table heatmap">
                  <caption className="sr-only">
                    Monthly percentage returns for {year}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      {months.map((month) => (
                        <th scope="col" key={month}>
                          {month}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <AssetName id={row.id} name={row.name} />
                        </th>
                        {row.values.map((value, i) => (
                          <td
                            key={i}
                            style={
                              value === null
                                ? undefined
                                : {
                                    backgroundColor: `rgba(${value < 0 ? "185, 28, 28" : "21, 128, 61"}, ${Math.min(Math.abs(value) / 20, 1) * 0.25})`,
                                  }
                            }
                            aria-label={`${row.name}, ${months[i]} ${year}: ${value === null ? assetStatus(row.status) : percent(value)}`}
                          >
                            {percent(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <p className="section-notice">
            {loading
              ? "Loading monthly history…"
              : "No monthly history available."}
          </p>
        )}
      </section>
      <Methodology>
        <article>
          <h3>One starting line.</h3>
          <p>
            All available assets with valid history use their first and last
            shared closing dates inside the selected period. The trailing period
            ends on the last completed UTC day. Short histories use the
            available shared range shown above. Each line is its price divided
            by its starting price; 1.20× means a 20% gain. Rankings use exactly
            those same endpoints. At least two shared dates are required.
          </p>
          <MathFormula
            display
            tex={String.raw`G_{A,t}=\frac{P_{A,t}}{P_{A,t_0}},\qquad R_A=(G_{A,t_1}-1)\times100\%`}
          />
        </article>
        <article>
          <h3>Calendar months, without shortcuts.</h3>
          <p>
            Monthly return compares the final daily close of a month with the
            final daily close of the preceding month. Both exact boundary prices
            must exist. The current month stays blank until complete. The period
            selector changes the cumulative chart and ranking; the heatmap
            always shows full history.
          </p>
        </article>
      </Methodology>
    </AnalysisShell>
  );
}
