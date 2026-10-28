export const DAY = 86_400_000;
export const ASSETS = [
  { id: "gold", name: "Gold", coin: "xyz:GOLD", symbol: "Au" },
  { id: "dxy", name: "DXY", coin: "xyz:DXY", symbol: "$" },
  { id: "sp500", name: "S&P 500", coin: "xyz:SP500", symbol: "500" },
  { id: "oil", name: "Oil (Brent)", coin: "xyz:BRENTOIL", symbol: "Oil" },
] as const;
export type AssetId = (typeof ASSETS)[number]["id"];
export type Candle = { t: number; T: number; c: string };
export type Point = { date: string; x: number; y: number };
export type Analysis = {
  status: "ready" | "insufficient";
  points: Point[];
  r: number | null;
  slope: number | null;
  intercept: number | null;
};
export type AssetData = {
  id: AssetId;
  status: "available" | "unavailable" | "error";
  candles: Candle[];
};
export type CorrelationData = {
  updatedAt: string;
  btc: Candle[];
  assets: AssetData[];
};

export function strength(r: number) {
  return Math.abs(r) >= 0.7
    ? "Strong"
    : Math.abs(r) >= 0.4
      ? "Moderate"
      : "Weak";
}

export function dailyReturns(candles: Candle[], now: number) {
  const closes = new Map<number, number>();
  for (const candle of candles) {
    const close = Number(candle.c);
    if (
      candle.t % DAY === 0 &&
      candle.T === candle.t + DAY - 1 &&
      candle.T < now &&
      Number.isFinite(close) &&
      close > 0
    ) {
      closes.set(candle.t, close);
    }
  }
  const returns = new Map<number, number>();
  for (const [time, close] of closes) {
    const previous = closes.get(time - DAY);
    if (previous !== undefined) returns.set(time, (close / previous - 1) * 100);
  }
  return returns;
}

export function analyze(
  btc: Candle[],
  asset: Candle[],
  days: number,
  now: number,
): Analysis {
  const bitcoin = dailyReturns(btc, now);
  const comparison = dailyReturns(asset, now);
  const cutoff = Math.floor(now / DAY) * DAY - days * DAY;
  const points: Point[] = [...comparison]
    .filter(([time]) => time >= cutoff && bitcoin.has(time))
    .sort(([a], [b]) => a - b)
    .map(([time, x]) => ({
      date: new Date(time).toISOString().slice(0, 10),
      x,
      y: bitcoin.get(time)!,
    }));
  return fit(points);
}

function fit(points: Point[]): Analysis {
  const empty: Analysis = {
    status: "insufficient",
    points,
    r: null,
    slope: null,
    intercept: null,
  };
  if (points.length < 20) return empty;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of points) {
    const dx = p.x - meanX,
      dy = p.y - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  if (xx <= Number.EPSILON || yy <= Number.EPSILON) return empty;
  const r = Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
  const slope = xy / xx;
  return {
    status: "ready",
    points,
    r,
    slope,
    intercept: meanY - slope * meanX,
  };
}

export type TimePoint = { date: string; value: number | null };
export type TimeSeries = { id: string; name: string; points: TimePoint[] };

export function completedCloses(candles: Candle[], now: number) {
  return new Map(
    candles
      .filter(
        (c) =>
          c.t % DAY === 0 &&
          c.T === c.t + DAY - 1 &&
          c.T < now &&
          Number.isFinite(Number(c.c)) &&
          Number(c.c) > 0,
      )
      .map((c) => [c.t, Number(c.c)]),
  );
}

export function rollingCorrelation(
  btc: Candle[],
  asset: Candle[],
  window: number,
  now: number,
): TimePoint[] {
  const bitcoin = dailyReturns(btc, now);
  const comparison = dailyReturns(asset, now);
  const times = [...comparison.keys()]
    .filter((t) => bitcoin.has(t))
    .sort((a, b) => a - b);
  if (!times.length) return [];
  const output: TimePoint[] = [];
  for (
    let end = times[0] + (window - 1) * DAY;
    end <= times[times.length - 1];
    end += DAY
  ) {
    const pairs: Point[] = [];
    for (let t = end - (window - 1) * DAY; t <= end; t += DAY) {
      if (bitcoin.has(t) && comparison.has(t))
        pairs.push({ date: "", x: comparison.get(t)!, y: bitcoin.get(t)! });
    }
    output.push({
      date: new Date(end).toISOString().slice(0, 10),
      value: pairs.length === window ? fit(pairs).r : null,
    });
  }
  return output;
}

export function cumulativeReturns(data: CorrelationData): TimeSeries[] {
  const now = new Date(data.updatedAt).getTime();
  const inputs = [
    { id: "btc", name: "Bitcoin", candles: data.btc },
    ...data.assets
      .filter((a) => a.status === "available" && a.candles.length)
      .map((a) => ({
        ...a,
        name: ASSETS.find((asset) => asset.id === a.id)!.name,
      })),
  ];
  const markets = inputs.map((input) => ({
    ...input,
    closes: completedCloses(input.candles, now),
  }));
  const shared = [...markets[0].closes.keys()]
    .filter((time) => markets.every((m) => m.closes.has(time)))
    .sort((a, b) => a - b);
  if (!shared.length) return [];
  const first = shared[0],
    last = shared[shared.length - 1];
  return markets.map((market) => {
    const base = market.closes.get(first)!;
    const points: TimePoint[] = [];
    for (let t = first; t <= last; t += DAY)
      points.push({
        date: new Date(t).toISOString().slice(0, 10),
        value: market.closes.has(t) ? market.closes.get(t)! / base : null,
      });
    return { id: market.id, name: market.name, points };
  });
}
