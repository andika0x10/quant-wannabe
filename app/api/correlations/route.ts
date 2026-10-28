import { loadCorrelations } from "../../../lib/hyperliquid";
import type { CorrelationData } from "../../../lib/correlations";

const TTL = 15 * 60 * 1000;
let cached: { data: CorrelationData; expires: number } | undefined;
let pending: Promise<CorrelationData> | undefined;

export async function GET() {
  try {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= loadCorrelations()
        .then((data) => {
          // A failed comparison must be retried rather than cached for 15 minutes.
          cached = {
            data,
            expires: data.assets.some((asset) => asset.status === "error")
              ? 0
              : Date.now() + TTL,
          };
          return data;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    const remaining = Math.max(
      0,
      Math.floor((cached!.expires - Date.now()) / 1000),
    );
    return Response.json(cached!.data, {
      headers: { "Cache-Control": `public, max-age=0, s-maxage=${remaining}` },
    });
  } catch {
    return Response.json(
      { error: "Market data could not be loaded from Hyperliquid. Try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
