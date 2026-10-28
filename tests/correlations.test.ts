import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  dailyReturns,
  strength,
  DAY,
  type Candle,
  rollingCorrelation,
  cumulativeReturns,
} from "../lib/correlations";
import { loadCorrelations, type InfoFetcher } from "../lib/hyperliquid";

const start = Date.UTC(2026, 6, 1);
const now = start + 32 * DAY;
function series(returns: number[]): Candle[] {
  let close = 100;
  return [0, ...returns].map((change, index) => {
    close *= 1 + change / 100;
    return {
      t: start + index * DAY,
      T: start + (index + 1) * DAY - 1,
      c: String(close),
    };
  });
}
const changes = Array.from({ length: 30 }, (_, i) => (i % 9) - 4);
const btc = series(changes);

test("identical and inverse returns yield +1 and −1 with correct regression", () => {
  const positive = analyze(btc, series(changes), 90, now);
  const negative = analyze(btc, series(changes.map((n) => -n)), 90, now);
  assert.equal(positive.status, "ready");
  assert.ok(Math.abs(positive.r! - 1) < 1e-12);
  assert.ok(Math.abs(negative.r! + 1) < 1e-12);
  assert.ok(Math.abs(negative.slope! + 1) < 1e-12);
  assert.ok(Math.abs(positive.intercept!) < 1e-12);
  assert.equal(positive.points.length, 30);
});

test("strength ignores direction and respects thresholds", () => {
  for (const sign of [-1, 1]) {
    assert.equal(strength(sign * 0.9), "Strong");
    assert.equal(strength(sign * 0.7), "Strong");
    assert.equal(strength(sign * 0.69), "Moderate");
    assert.equal(strength(sign * 0.4), "Moderate");
    assert.equal(strength(sign * 0.39), "Weak");
  }
});

test("constant series and fewer than 20 pairs are insufficient", () => {
  assert.equal(
    analyze(btc, series(Array(30).fill(0)), 90, now).status,
    "insufficient",
  );
  assert.equal(analyze(btc, btc.slice(0, 20), 90, now).status, "insufficient");
});

test("returns require consecutive complete UTC days and valid closes", () => {
  const input = btc.filter((_, i) => i !== 10);
  const returns = dailyReturns(input, now);
  assert.equal(returns.has(start + 10 * DAY), false);
  assert.equal(returns.has(start + 11 * DAY), false);
  assert.equal(returns.has(start + 12 * DAY), true);
  assert.equal(dailyReturns(btc, start + 5 * DAY).size, 4);
  assert.equal(
    dailyReturns([{ ...btc[0], c: "NaN" }, ...btc.slice(1)], now).has(
      start + DAY,
    ),
    false,
  );
  const aligned = analyze(btc, input.toReversed(), 90, now);
  assert.equal(aligned.points.length, 28);
  assert.ok(Math.abs(aligned.r! - 1) < 1e-12);
  assert.equal(analyze(btc, btc, 30, now).points.length, 29);
});

test("Hyperliquid loader isolates comparison failure and excludes delisted DXY", async () => {
  const calls: Record<string, unknown>[] = [];
  const request: InfoFetcher = async (body) => {
    calls.push(body);
    if (body.type === "allPerpMetas")
      return [
        {
          universe: [
            { name: "xyz:GOLD" },
            { name: "xyz:SP500" },
            { name: "xyz:DXY", isDelisted: true },
          ],
        },
      ];
    const req = body.req as { coin: string; endTime: number };
    assert.equal(req.endTime, Math.floor(now / DAY) * DAY - 1);
    if (req.coin === "xyz:SP500") throw new Error("Network failure");
    return btc;
  };
  const result = await loadCorrelations(now, request);
  assert.equal(result.assets.find((a) => a.id === "gold")?.status, "available");
  assert.equal(result.assets.find((a) => a.id === "sp500")?.status, "error");
  assert.deepEqual(
    result.assets.find((a) => a.id === "dxy"),
    { id: "dxy", status: "unavailable", candles: [] },
  );
  assert.equal(
    calls.some(
      (c) => (c.req as { coin?: string } | undefined)?.coin === "xyz:DXY",
    ),
    false,
  );
});

test("loader rejects total failure and handles missing or empty markets", async () => {
  await assert.rejects(
    loadCorrelations(now, async () => {
      throw new Error("Offline");
    }),
  );
  const result = await loadCorrelations(now, async (body) =>
    body.type === "allPerpMetas"
      ? [{ universe: [{ name: "xyz:GOLD" }] }]
      : (body.req as { coin: string }).coin === "BTC"
        ? btc
        : [],
  );
  assert.ok(result.assets.every((a) => a.status === "unavailable"));
});

test("rolling correlation needs full windows and never uses future returns", () => {
  const changes = Array.from({ length: 120 }, (_, i) => (i % 9) - 4);
  const bitcoin = series(changes);
  const comparison = series(changes.map((n) => -n));
  const end = start + 122 * DAY;
  const rolling = rollingCorrelation(bitcoin, comparison, 90, end);
  assert.equal(rolling.length, 31);
  assert.equal(
    rolling[0].date,
    new Date(start + 90 * DAY).toISOString().slice(0, 10),
  );
  assert.ok(rolling.every((p) => Math.abs(p.value! + 1) < 1e-12));
  const changedFuture = comparison.map((c, i) =>
    i > 90 ? { ...c, c: String(Number(c.c) * 2) } : c,
  );
  assert.equal(
    rollingCorrelation(bitcoin, changedFuture, 90, end)[0].value,
    rolling[0].value,
  );
  const gap = rollingCorrelation(
    bitcoin,
    comparison.filter((_, i) => i !== 100),
    90,
    end,
  );
  assert.equal(
    gap.find(
      (p) => p.date === new Date(start + 100 * DAY).toISOString().slice(0, 10),
    )?.value,
    null,
  );
  assert.deepEqual(rollingCorrelation(btc, btc, 90, now), []);
});

test("six-month and one-year windows require all 180 or 365 daily returns", () => {
  const changes = Array.from({ length: 400 }, (_, i) => (i % 9) - 4);
  const bitcoin = series(changes);
  const end = start + 402 * DAY;
  for (const window of [180, 365]) {
    const points = rollingCorrelation(bitcoin, bitcoin, window, end);
    assert.equal(points.length, 401 - window);
    assert.equal(
      points[0].date,
      new Date(start + window * DAY).toISOString().slice(0, 10),
    );
    assert.ok(points.every((point) => Math.abs(point.value! - 1) < 1e-12));
    assert.deepEqual(
      rollingCorrelation(
        bitcoin.slice(0, window),
        bitcoin.slice(0, window),
        window,
        end,
      ),
      [],
    );
  }
});

test("cumulative lines share one baseline and preserve gaps, excluding unavailable DXY", () => {
  const result = cumulativeReturns({
    updatedAt: new Date(now).toISOString(),
    btc,
    assets: [
      {
        id: "gold",
        status: "available",
        candles: btc.filter((_, i) => i >= 5 && i !== 10),
      },
      { id: "oil", status: "available", candles: btc.slice(7) },
      { id: "dxy", status: "unavailable", candles: [] },
    ],
  });
  assert.equal(result.length, 3);
  assert.ok(result.every((s) => s.points[0].value === 1));
  assert.ok(
    result.every(
      (s) =>
        s.points[0].date ===
        new Date(start + 7 * DAY).toISOString().slice(0, 10),
    ),
  );
  assert.equal(result.find((s) => s.id === "gold")?.points[3].value, null);
  assert.ok(
    Math.abs(
      result[0].points[4].value! - Number(btc[11].c) / Number(btc[7].c),
    ) < 1e-12,
  );
});

test("full-history loader requests Oil using the active Brent market", async () => {
  const requested: string[] = [];
  const result = await loadCorrelations(now, async (body) => {
    if (body.type === "allPerpMetas")
      return [{ universe: [{ name: "xyz:BRENTOIL" }] }];
    const req = body.req as { coin: string; startTime: number };
    assert.equal(req.startTime, 0);
    requested.push(req.coin);
    return btc;
  });
  assert.ok(requested.includes("xyz:BRENTOIL"));
  assert.equal(result.assets.find((a) => a.id === "oil")?.status, "available");
});
