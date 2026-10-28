import {
  ASSETS,
  DAY,
  type Candle,
  type AssetData,
  type CorrelationData,
} from "./correlations";

type Meta = { universe: { name: string; isDelisted?: boolean }[] };
export type InfoFetcher = (body: Record<string, unknown>) => Promise<unknown>;

export async function info(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hyperliquid returned ${response.status}`);
  return response.json();
}

function candles(value: unknown): Candle[] {
  if (!Array.isArray(value)) throw new Error("Invalid candle response");
  return value.filter(
    (row): row is Candle =>
      row !== null &&
      typeof row === "object" &&
      typeof row.t === "number" &&
      typeof row.T === "number" &&
      typeof row.c === "string",
  );
}

export async function loadCorrelations(
  now = Date.now(),
  request: InfoFetcher = info,
): Promise<CorrelationData> {
  const endTime = Math.floor(now / DAY) * DAY - 1;
  // Request the full retained daily history (the API retains up to 5,000 bars).
  const startTime = 0;
  const readCandles = async (coin: string) =>
    candles(
      await request({
        type: "candleSnapshot",
        req: { coin, interval: "1d", startTime, endTime },
      }),
    );
  const [metadata, btc] = await Promise.all([
    request({ type: "allPerpMetas" }),
    readCandles("BTC"),
  ]);
  if (
    !Array.isArray(metadata) ||
    !metadata.every((m: Meta) => Array.isArray(m?.universe))
  )
    throw new Error("Invalid metadata response");
  if (!btc.length) throw new Error("Bitcoin candles unavailable");
  const markets = (metadata as Meta[]).flatMap((m) => m.universe);
  const assets = await Promise.all(
    ASSETS.map(async (asset): Promise<AssetData> => {
      const market = markets.find((m) => m.name === asset.coin);
      if (!market || market.isDelisted)
        return { id: asset.id, status: "unavailable", candles: [] };
      try {
        const rows = await readCandles(asset.coin);
        return {
          id: asset.id,
          status: rows.length ? "available" : "unavailable",
          candles: rows,
        };
      } catch {
        return { id: asset.id, status: "error", candles: [] };
      }
    }),
  );
  return { updatedAt: new Date(now).toISOString(), btc, assets };
}
