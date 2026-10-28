# Quant Wannabe

A three-page market analysis playground with a monochrome interface and thin, colored chart lines. English copy, dry humor, real Hyperliquid data, and client-loaded Plotly charts. Built with React, Vinext, Vite, and Cloudflare Workers.

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

## Analysis pages

`/` redirects to `/correlations`. Shared navigation, loading/retry states, market availability and fetch timestamps appear on every page. A root client provider keeps the fetched dataset across navigation; all pages consume the existing `/api/correlations` response. Each page has its own browser title and methodology anchor.

### Bitcoin correlations — `/correlations`

Every available comparison asset shares a rolling correlation chart against Bitcoin. Daily percentage returns require consecutive completed UTC daily closes. Windows are 30 days, 90 days (default), 6 months (180 days), and 1 year (365 days). Incomplete windows or constant series produce gaps. Pearson's signed r indicates direction; absolute r indicates strength: strong at 0.70 or above, moderate from 0.40 to below 0.70, otherwise weak. Latest readings show the last window for each comparison. Insufficient history produces an explanatory empty state.

### Market performance — `/performance`

The cumulative chart and return ranking use the same first and last shared dates among available markets with valid history. Periods are 30 days, 90 days, 6 months, 1 year, and All (default). A trailing N-day period includes its baseline close N days before the last completed UTC day. Shorter histories use the actual shared range displayed below the chart; fewer than two shared dates produce an empty state. Values are closing price divided by the baseline close, starting at 1×. Missing interior prices remain gaps. Unavailable markets do not restrict shared endpoints. Rankings sort percentage returns from highest to lowest and keep unavailable/error markets explicitly labeled.

Monthly heatmaps always show full history, grouped by year. A monthly return requires the exact final daily closes of that month and the preceding month. Missing boundaries, future months, and the current unfinished month stay blank. Each cell includes its signed percentage and an accessible asset/month label. The loss/gain colour scale saturates at ±20%; tables scroll within their containers on small screens.

### Risk & drawdown — `/risk`

Drawdown is `(close / highest observed close to date - 1) * 100`, using each market's own full retained history. Missing days are gaps; the last observed peak is retained across gaps. Maximum drawdown is the minimum observed drawdown. The risk table lists each asset's date coverage, since different listing dates limit comparisons.

Rolling volatility is the sample standard deviation of consecutive daily percentage returns, annualized by `sqrt(365)`. Windows are 30 days (default) and 90 days. Every window requires all daily returns, with no gap filling. Constant returns yield zero volatility. The latest volatility is shown only if a complete window ends on the asset's final observed close; its as-of date is displayed.

All analyses use `updatedAt` as their time reference and completed UTC candles with finite positive closes. Price returns exclude funding, fees, and dividends. Every chart supports unified date hover, legend toggles, zoom/reset, and PNG export. Asset colours and the shared 1.25 px line-width token are defined in `lib/chart-settings.ts`.

Space Grotesk and Instrument Sans are served locally from `public/fonts`, alongside their SIL Open Font Licenses.

## Math and touch controls

KaTeX renders the methodology equations, with both HTML and accessible MathML. Its stylesheet and math fonts are bundled locally. Use the reusable component for inline constants or display equations:

```tsx
import MathFormula from "./components/math-formula";

<MathFormula tex={String.raw`|r| \geq 0.70`} />
<MathFormula display tex={String.raw`G_{A,t} = \frac{P_{A,t}}{P_{A,t_0}}`} />
```

On narrow screens and touch devices, asset toggles and chart actions have 44 px touch targets. Charts allow native vertical page scrolling by default, with tap-to-inspect unified tooltips. Zoom is opt-in; Reset restores the full view and scroll mode. PNG export is available through Save PNG. Touch controls remain available after rotating the device.
