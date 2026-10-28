# Quant Wannabe

A Bitcoin correlation playground with a monochrome interface and colored chart lines. English copy, dry humor, real Hyperliquid data, and two client-loaded Plotly time-series charts. Built with React, Vinext, Vite, and Cloudflare Workers.

## Local development

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Checks

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser tests use labeled synthetic fixtures inside the test suite only. The application always fetches real Hyperliquid data. Playwright starts a local dev server, or reuses one already running on port 5173.

## Data and method

`GET /api/correlations` returns `updatedAt`, `btc` candles, and comparison assets with an `id`, `status` (`available`, `unavailable`, or `error`), and `candles`. Candles retain Hyperliquid’s `t` (open time), `T` (close time), and `c` (close price) fields. Fatal upstream failures return HTTP 502 with an error message. No API key is needed.

The server requests metadata and the full retained daily candle history (up to Hyperliquid’s 5,000-bar limit). Supported markets are `BTC`, `xyz:GOLD`, `xyz:DXY`, `xyz:SP500`, and `xyz:BRENTOIL` (Brent crude oil). These are perpetual contracts; the comparison markets are proxies rather than official index or spot feeds. Missing and delisted markets stay unavailable. A failed comparison does not block the others.

Successful results are cached for 15 minutes per server instance, with shared-cache headers reflecting the remaining TTL. Responses containing a failed comparison are immediately retryable. There is no polling, database, wallet, or fallback data provider.

The top chart combines every available asset’s rolling correlation with Bitcoin. Returns are `(close / previousClose - 1) * 100`, requiring consecutive completed UTC days. Windows are 30 days, 90 days (default), 6 months (180 days), and 1 year (365 days), without future observations or gap filling. An incomplete window or a constant series yields a gap. If no market has enough history, an explanatory empty state replaces the rolling chart while the cumulative chart remains available. Pearson’s signed r reports direction; its absolute value reports strength: strong at 0.70 or above, moderate from 0.40 to below 0.70, otherwise weak. The readings below the chart show the last window for each comparison.

The lower chart combines Bitcoin and all available comparison markets, rebased to 1× on their first shared date. Values are close price divided by the baseline close, without funding, fees, or dividends. Missing closes remain gaps; unavailable assets do not restrict the baseline date. Each chart uses full available history, unified date hover, legend toggles, zoom/reset, and PNG export. Asset colors are consistent across both charts, legends, and latest readings; the palette and rolling window options are defined in `lib/chart-settings.ts`.

Space Grotesk and Instrument Sans are served locally from `public/fonts`, alongside their SIL Open Font Licenses.

## Math and touch controls

KaTeX renders the methodology equations, with both HTML and accessible MathML. Its stylesheet and math fonts are bundled locally. Use the reusable component for inline constants or display equations:

```tsx
import MathFormula from "./components/math-formula";

<MathFormula tex={String.raw`|r| \geq 0.70`} />
<MathFormula display tex={String.raw`G_{A,t} = \frac{P_{A,t}}{P_{A,t_0}}`} />
```

On narrow screens and touch devices, asset toggles and chart actions have 44 px touch targets. Charts allow native vertical page scrolling by default, with tap-to-inspect unified tooltips. Zoom is opt-in; Reset restores the full view and scroll mode. PNG export is available through Save PNG. Touch controls remain available after rotating the device.
