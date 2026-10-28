import {
  ASSETS,
  DAY,
  completedCloses,
  dailyReturns,
  type CorrelationData,
  type TimePoint,
  type TimeSeries,
} from "./correlations";

export function markets(data: CorrelationData) {
  const now = Date.parse(data.updatedAt);
  return [
    {
      id: "btc",
      name: "Bitcoin",
      status: "available" as const,
      candles: data.btc,
    },
    ...ASSETS.map((asset) => ({
      ...asset,
      status:
        data.assets.find((a) => a.id === asset.id)?.status ?? "unavailable",
      candles: data.assets.find((a) => a.id === asset.id)?.candles ?? [],
    })),
  ].map((market) => ({
    ...market,
    closes: completedCloses(market.candles, now),
  }));
}

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function performance(data: CorrelationData, days: number | null) {
  const inputs = markets(data).filter(
    (m) => m.status === "available" && m.closes.size,
  );
  const cutoff =
    days === null
      ? -Infinity
      : Math.floor(Date.parse(data.updatedAt) / DAY) * DAY - (days + 1) * DAY;
  const shared = inputs.length
    ? [...inputs[0].closes.keys()]
        .filter((t) => t >= cutoff && inputs.every((m) => m.closes.has(t)))
        .sort((a, b) => a - b)
    : [];
  if (shared.length < 2)
    return {
      series: [] as TimeSeries[],
      ranking: [] as { id: string; name: string; value: number }[],
      start: null,
      end: null,
    };
  const first = shared[0],
    last = shared[shared.length - 1];
  const series = inputs.map((m) => {
    const points: TimePoint[] = [];
    for (let t = first; t <= last; t += DAY)
      points.push({
        date: iso(t),
        value: m.closes.has(t) ? m.closes.get(t)! / m.closes.get(first)! : null,
      });
    return { id: m.id, name: m.name, points };
  });
  const ranking = series
    .map((s) => ({
      id: s.id,
      name: s.name,
      value: (s.points.at(-1)!.value! - 1) * 100,
    }))
    .sort((a, b) => b.value - a.value);
  return { series, ranking, start: iso(first), end: iso(last) };
}

export function monthlyReturns(data: CorrelationData) {
  const inputs = markets(data);
  const now = Date.parse(data.updatedAt);
  const current = new Date(now);
  const currentMonth = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    1,
  );
  const times = inputs
    .filter((m) => m.status === "available")
    .flatMap((m) => [...m.closes.keys()]);
  if (!times.length) return [];
  const firstYear = new Date(Math.min(...times)).getUTCFullYear();
  const years = [];
  for (let year = current.getUTCFullYear(); year >= firstYear; year--) {
    years.push({
      year,
      rows: inputs.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        values: Array.from({ length: 12 }, (_, month) => {
          const start = Date.UTC(year, month, 1);
          const end = Date.UTC(year, month + 1, 1) - DAY;
          const base = m.closes.get(start - DAY),
            close = m.closes.get(end);
          return m.status === "available" &&
            start < currentMonth &&
            base !== undefined &&
            close !== undefined
            ? (close / base - 1) * 100
            : null;
        }),
      })),
    });
  }
  return years;
}

export function drawdown(
  candles: Parameters<typeof completedCloses>[0],
  now: number,
): TimePoint[] {
  const closes = completedCloses(candles, now);
  const times = [...closes.keys()].sort((a, b) => a - b);
  if (!times.length) return [];
  let peak = 0;
  const points: TimePoint[] = [];
  for (let t = times[0]; t <= times[times.length - 1]; t += DAY) {
    const close = closes.get(t);
    if (close !== undefined) peak = Math.max(peak, close);
    points.push({
      date: iso(t),
      value: close === undefined ? null : (close / peak - 1) * 100,
    });
  }
  return points;
}

export function rollingVolatility(
  candles: Parameters<typeof dailyReturns>[0],
  window: number,
  now: number,
): TimePoint[] {
  const returns = dailyReturns(candles, now);
  const times = [...returns.keys()].sort((a, b) => a - b);
  if (!times.length) return [];
  const points: TimePoint[] = [];
  for (
    let end = times[0] + (window - 1) * DAY;
    end <= times[times.length - 1];
    end += DAY
  ) {
    const values = [];
    for (let t = end - (window - 1) * DAY; t <= end; t += DAY)
      if (returns.has(t)) values.push(returns.get(t)!);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const value =
      values.length === window && window > 1
        ? Math.sqrt(
            values.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (window - 1),
          ) * Math.sqrt(365)
        : null;
    points.push({ date: iso(end), value });
  }
  return points;
}

export function riskAnalysis(data: CorrelationData, window: number) {
  const now = Date.parse(data.updatedAt);
  return markets(data).map((m) => {
    const active = m.status === "available";
    const points = active ? drawdown(m.candles, now) : [];
    const volatility = active ? rollingVolatility(m.candles, window, now) : [];
    const observed = points.flatMap((p) => (p.value === null ? [] : [p.value]));
    const last = points.at(-1)?.date;
    const latest = volatility.at(-1);
    return {
      ...m,
      points,
      volatility,
      maximum: observed.length ? Math.min(...observed) : null,
      latestVolatility: latest && latest.date === last ? latest.value : null,
      volatilityDate:
        latest && latest.date === last && latest.value !== null
          ? latest.date
          : null,
      start: points[0]?.date,
      end: last,
    };
  });
}
