"use client";

import { useMemo, useState } from "react";
import { riskAnalysis } from "../../lib/market-analysis";
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

export default function RiskDashboard() {
  const { data, ready, loading, failed } = useMarketData();
  const [window, setWindow] = useState(30);
  const rows = useMemo(
    () => (data ? riskAnalysis(data, window) : []),
    [data, window],
  );
  const drawdowns = useMemo(
    () =>
      rows
        .filter((r) => r.points.length)
        .map((r) => ({ id: r.id, name: r.name, points: r.points })),
    [rows],
  );
  const volatility = useMemo(
    () =>
      rows
        .filter((r) => r.volatility.some((p) => p.value !== null))
        .map((r) => ({ id: r.id, name: r.name, points: r.volatility })),
    [rows],
  );
  const empty = (message: string) => (
    <div className="chart-empty" role="status">
      <p>
        {loading
          ? "Measuring the bumps…"
          : failed
            ? "Market data could not be loaded."
            : message}
      </p>
    </div>
  );
  return (
    <AnalysisShell
      title="Risk & drawdown"
      description="How rough was the ride? Peaks, pullbacks, and daily swings."
    >
      <section aria-labelledby="drawdown-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="drawdown-title">Drawdown</h2>
            <p>Distance below each asset’s historical closing high.</p>
          </div>
          <span className="baseline-label">
            Full available history per asset
          </span>
        </div>
        {ready && drawdowns.length ? (
          <TimelinePlot series={drawdowns} kind="drawdown" />
        ) : (
          empty("No completed price history available.")
        )}
        <div className="chart-footnote">
          <span>
            0% marks a closing high. Negative values show the decline.
          </span>
          <span>History starts separately for each asset · UTC</span>
        </div>
      </section>
      <section className="analysis-section" aria-labelledby="volatility-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="volatility-title">Rolling volatility</h2>
            <p>Daily return variability, annualized using 365 days.</p>
          </div>
          <div className="window-control">
            <span>Rolling window</span>
            <div
              className="period-switch"
              role="group"
              aria-label="Volatility window"
            >
              {[30, 90].map((days) => (
                <button
                  key={days}
                  aria-pressed={window === days}
                  className={window === days ? "active" : ""}
                  onClick={() => setWindow(days)}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
        </div>
        {ready && volatility.length ? (
          <TimelinePlot series={volatility} kind="volatility" />
        ) : (
          empty(
            `Not enough history for ${window} consecutive daily returns. Try 30 days.`,
          )
        )}
        <div className="chart-footnote">
          <span>Trailing {window} consecutive UTC daily returns per point</span>
          <span>Annualized sample standard deviation (%)</span>
        </div>
      </section>
      <section className="analysis-section" aria-labelledby="risk-table-title">
        <div className="chart-toolbar">
          <div>
            <h2 id="risk-table-title">Risk by asset</h2>
            <p>
              Maximum drawdown uses each asset’s full history, so coverage
              differs.
            </p>
          </div>
        </div>
        <p className="table-hint">
          Swipe the table horizontally to see all risk readings.
        </p>
        {ready ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Risk by asset table"
            tabIndex={0}
          >
            <table className="analysis-table risk-table">
              <caption className="sr-only">
                Historical drawdowns and latest {window}-day annualized
                volatility
              </caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col">Maximum drawdown</th>
                  <th scope="col">Latest volatility</th>
                  <th scope="col">Observed range (UTC)</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <AssetName id={r.id} name={r.name} />
                    </th>
                    <td>{percent(r.maximum)}</td>
                    <td>
                      {percent(r.latestVolatility)}
                      {r.volatilityDate && (
                        <span className="table-detail">
                          As of {formatDate(r.volatilityDate)}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.start && r.end ? (
                        <>
                          {formatDate(r.start)}
                          <span className="table-detail">
                            to {formatDate(r.end)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {r.status !== "available" || !r.points.length
                        ? assetStatus(r.status)
                        : r.latestVolatility === null
                          ? `Insufficient ${window}-day volatility history`
                          : "Available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="section-notice">
            {loading
              ? "Loading risk readings…"
              : "Load market data to view risk readings."}
          </p>
        )}
      </section>
      <Methodology>
        <article>
          <h3>Below the peak.</h3>
          <p>
            Drawdown compares each daily closing price with the highest
            completed daily close observed up to that date. Maximum drawdown is
            the most negative value. Gaps stay empty and do not erase the last
            observed peak. Peaks before the available history are unknown.
          </p>
          <MathFormula
            display
            tex={String.raw`D_{A,t}=\left(\frac{P_{A,t}}{\max_{s\leq t}P_{A,s}}-1\right)\times100\%`}
          />
        </article>
        <article>
          <h3>Variability, on a yearly scale.</h3>
          <p>
            Volatility is the sample standard deviation of {window} consecutive
            daily percentage returns multiplied by the square root of 365. Every
            return needs two consecutive daily closes; any missing day leaves a
            gap until a complete window is available again. Constant returns
            have zero volatility. The latest reading is shown only when the
            window ends on that asset’s last observed close.
          </p>
          <MathFormula
            display
            tex={String.raw`\sigma_{\mathrm{annual}}=\sqrt{\frac{\sum_{i=1}^{n}(R_i-\bar R)^2}{n-1}}\sqrt{365}`}
          />
        </article>
      </Methodology>
    </AnalysisShell>
  );
}
