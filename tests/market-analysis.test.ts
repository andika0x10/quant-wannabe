import test from "node:test";
import assert from "node:assert/strict";
import { DAY, type Candle, type CorrelationData } from "../lib/correlations";
import {
  drawdown,
  monthlyReturns,
  performance,
  riskAnalysis,
  rollingVolatility,
} from "../lib/market-analysis";

const start = Date.UTC(2026, 0, 1);
const candle = (t: number, close: number): Candle => ({
  t,
  T: t + DAY - 1,
  c: String(close),
});
const history = (prices: number[], base = start) =>
  prices.map((p, i) => candle(base + i * DAY, p));
function data(btc: Candle[], gold: Candle[] = []): CorrelationData {
  return {
    updatedAt: new Date(Date.UTC(2026, 4, 15)).toISOString(),
    btc,
    assets: [
      {
        id: "gold",
        status: gold.length ? "available" : "unavailable",
        candles: gold,
      },
      { id: "dxy", status: "unavailable", candles: [] },
      { id: "sp500", status: "error", candles: [] },
      { id: "oil", status: "unavailable", candles: [] },
    ],
  };
}
const near = (a: number | null, b: number) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("performance uses shared endpoints, preserves interior gaps and ranks by those endpoints", () => {
  const result = performance(
    data(history([100, 110, 120, 130]), [
      candle(start + DAY, 10),
      candle(start + 3 * DAY, 20),
    ]),
    null,
  );
  assert.equal(result.start, "2026-01-02");
  assert.equal(result.end, "2026-01-04");
  assert.equal(result.series[1].points[1].value, null);
  assert.equal(result.ranking[0].id, "gold");
  near(result.ranking[0].value, 100);
  near(result.ranking[1].value, (130 / 110 - 1) * 100);
  assert.deepEqual(
    result.series.map((s) => s.points[0].value),
    [1, 1],
  );
});

test("trailing period includes its baseline and excludes incomplete, invalid and future prices", () => {
  const end = Date.UTC(2026, 4, 15);
  const input = data(
    history(
      Array.from({ length: 40 }, (_, i) => 100 + i),
      end - 40 * DAY,
    ),
  );
  input.btc.push(candle(end, 999), candle(end - DAY, -1));
  const result = performance(input, 30);
  assert.equal(result.start, "2026-04-14");
  assert.equal(result.end, "2026-05-14");
  assert.equal(result.series[0].points.length, 31);
  assert.equal(performance(data(history([100])), null).series.length, 0);
  assert.equal(performance(data([]), 30).ranking.length, 0);
});

test("monthly returns require exact closing boundaries and leave the current month empty", () => {
  const input = data([
    candle(Date.UTC(2025, 11, 31), 100),
    candle(Date.UTC(2026, 0, 31), 110),
    candle(Date.UTC(2026, 1, 28), 99),
    candle(Date.UTC(2026, 2, 30), 120),
    candle(Date.UTC(2026, 3, 30), 150),
    candle(Date.UTC(2026, 4, 14), 180),
  ]);
  const years = monthlyReturns(input);
  assert.deepEqual(
    years.map((y) => y.year),
    [2026, 2025],
  );
  const values = years[0].rows[0].values;
  near(values[0], 10);
  near(values[1], -10);
  assert.equal(values[2], null);
  assert.equal(values[3], null);
  assert.equal(values[4], null);
  assert.ok(years[0].rows[1].values.every((v) => v === null));
});

test("drawdown carries the observed peak across gaps and recovers at a new high", () => {
  const input = history([100, 120, 90, 130]);
  input.splice(1, 0, candle(start - DAY, 80));
  input.push(candle(start + 5 * DAY, 65));
  const points = drawdown(input.reverse(), start + 7 * DAY);
  near(points[3].value, -25);
  near(points[4].value, 0);
  assert.equal(points[5].value, null);
  near(points[6].value, -50);
  assert.deepEqual(drawdown([], start), []);
  assert.equal(drawdown(history([100]), start).length, 0);
});

test("sample volatility is annualized, constant prices yield zero, and incomplete windows stay gaps", () => {
  const input = history([100, 110, 99, 108.9]);
  const points = rollingVolatility(input, 3, start + 5 * DAY);
  near(points[0].value, Math.sqrt(400 / 3 / 1) * Math.sqrt(365));
  assert.equal(rollingVolatility(input, 30, start + 5 * DAY).length, 0);
  near(
    rollingVolatility(history([100, 100, 100, 100]), 3, start + 5 * DAY)[0]
      .value,
    0,
  );
  const gap = history([100, 110, 120, 130, 140, 150, 160, 170]);
  gap.splice(3, 1);
  const result = rollingVolatility(gap, 3, start + 9 * DAY);
  assert.equal(result.find((p) => p.date === "2026-01-06")?.value, null);
  assert.notEqual(result.at(-1)?.value, null);
});

test("risk rows preserve asset status, coverage, maximum drawdown and insufficient volatility", () => {
  const rows = riskAnalysis(
    data(history([100, 80, 120]), history([20, 10], start + DAY)),
    30,
  );
  near(rows[0].maximum, -20);
  assert.equal(rows[1].start, "2026-01-02");
  near(rows[1].maximum, -50);
  assert.equal(rows[0].latestVolatility, null);
  assert.equal(rows[2].status, "unavailable");
  assert.equal(rows[3].status, "error");
  assert.equal(rows[2].maximum, null);
});
