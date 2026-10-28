import { test, expect } from "@playwright/test";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 28);
function candles(reverse = false) {
  let close = 100;
  return Array.from({ length: 181 }, (_, i) => {
    const t = now - (181 - i) * DAY;
    close *= 1 + (((i % 11) - 5) * (reverse ? -1 : 1)) / 100;
    return { t, T: t + DAY - 1, c: String(close) };
  });
}
// Synthetic price histories are restricted to browser tests.
const fixture = {
  updatedAt: new Date(now).toISOString(),
  btc: candles(),
  assets: [
    { id: "gold", status: "available", candles: candles(true) },
    { id: "dxy", status: "unavailable", candles: [] },
    { id: "sp500", status: "available", candles: candles() },
    { id: "oil", status: "available", candles: candles() },
  ],
};

test("correlations redirect, rolling chart and performance chart share asset styling", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0;
  await page.route("**/api/correlations", async (route) => {
    requests++;
    await route.fulfill({ json: fixture });
  });
  await page.goto("/");
  const plots = page.locator(".plot-shell[aria-busy=false]");
  await expect(plots).toHaveCount(1);
  await expect(page.locator(".site-header svg, .site-header img")).toHaveCount(
    0,
  );
  const rolling = page.locator('[data-kind="rolling"]');
  await expect(page).toHaveURL(/\/correlations$/);
  await expect(page).toHaveTitle("Bitcoin correlations | Quant Wannabe");
  await expect(page.locator('nav [aria-current="page"]')).toHaveText(
    "Correlations",
  );
  await expect(rolling.locator(".legendtext")).toHaveText([
    "Gold",
    "S&P 500",
    "Oil (Brent)",
  ]);
  const rollingLines = await rolling
    .locator(".js-plotly-plot")
    .evaluate((el) =>
      (
        el as HTMLElement & {
          data: {
            name: string;
            line: { color: string; width: number; dash: string };
          }[];
        }
      ).data.map((s) => ({ name: s.name, ...s.line })),
    );
  for (const line of rollingLines) {
    expect(line.width).toBe(1.25);
    expect(line.dash).toBe("solid");
  }
  await expect(page.locator(".latest-reading").first()).toContainText("−1.00");
  await expect(page.locator(".latest-reading").first()).toContainText("Strong");
  await expect(page.locator(".latest-reading").nth(1)).toContainText(
    "Data unavailable",
  );
  const pointCount = () =>
    rolling
      .locator(".js-plotly-plot")
      .evaluate(
        (el) =>
          (el as HTMLElement & { data?: { x: unknown[] }[] }).data?.[0]?.x
            .length ?? 0,
      );
  const before = await pointCount();
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect(rolling).toHaveAttribute("aria-busy", "false");
  await expect.poll(pointCount).toBe(before + 60);
  await expect(page.locator(".chart-footnote").first()).toContainText(
    "Trailing 30",
  );
  await rolling.locator(".legendtoggle").first().click();
  await expect(rolling.locator(".scatterlayer .trace")).toHaveCount(2);
  await rolling.locator(".legendtoggle").first().click();
  await expect(rolling.locator(".scatterlayer .trace")).toHaveCount(3);
  await rolling.locator('[data-title="Zoom in"]').click();
  await rolling.locator('[data-title="Reset axes"]').click();
  const download = page.waitForEvent("download");
  await rolling.locator('[data-title="Download plot as a PNG"]').click();
  expect((await download).suggestedFilename()).toBe(
    "quant-wannabe-rolling.png",
  );
  await page.getByRole("button", { name: "6 months", exact: true }).click();
  await expect(rolling).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".chart-footnote").first()).toContainText(
    "Trailing 180",
  );
  await expect.poll(pointCount).toBe(1);
  await page.getByRole("button", { name: "1 year", exact: true }).click();
  await expect(page.locator(".relationship .chart-empty")).toContainText(
    "365-day window",
  );
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  await expect(rolling).toHaveAttribute("aria-busy", "false");
  await page.getByRole("link", { name: "Performance", exact: true }).click();
  const cumulative = page.locator('[data-kind="cumulative"]');
  await expect(cumulative).toHaveAttribute("aria-busy", "false");
  await expect(cumulative.locator(".legendtext")).toHaveText([
    "Bitcoin",
    "Gold",
    "S&P 500",
    "Oil (Brent)",
  ]);
  const cumulativeLines = await cumulative
    .locator(".js-plotly-plot")
    .evaluate((el) =>
      (
        el as HTMLElement & {
          data: { name: string; line: { color: string; width: number } }[];
        }
      ).data.map((s) => ({ name: s.name, ...s.line })),
    );
  expect(new Set(cumulativeLines.map((s) => s.color)).size).toBe(4);
  for (const line of rollingLines)
    expect(cumulativeLines.find((s) => s.name === line.name)?.color).toBe(
      line.color,
    );
  expect(cumulativeLines.every((s) => s.width === 1.25)).toBe(true);
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});

test("failed requests recover through retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/correlations", async (route) => {
    attempts++;
    await route.fulfill(
      attempts === 1
        ? { status: 502, json: { error: "Offline" } }
        : { json: fixture },
    );
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Market data could not be loaded",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(1);
  await expect(page.locator(".math-block .katex")).toHaveCount(2);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("mobile keeps correlations visible without overflow and supports keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/correlations", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/");
  await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Quant Wannabe." }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Correlations", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Performance", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Risk", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "How it works" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "30 days", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".chart-footnote").first()).toContainText(
    "Trailing 30",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test.describe("touch screens", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const width of [320, 390]) {
    test(`math and touch chart controls work at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/correlations", (route) =>
        route.fulfill({ json: fixture }),
      );
      await page.goto("/");
      await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(1);
      const rolling = page.locator('[data-kind="rolling"]');
      const windows = page.getByRole("group", {
        name: "Rolling window",
        exact: true,
      });
      await expect(windows.getByRole("button")).toHaveText([
        "30 days",
        "90 days",
        "6 months",
        "1 year",
      ]);
      expect(
        await windows
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons.every(
              (button) => button.getBoundingClientRect().height >= 44,
            ),
          ),
      ).toBe(true);
      await expect(rolling.locator(".touch-legend button")).toHaveCount(3);
      const legend = rolling.getByRole("button", { name: "Gold", exact: true });
      expect((await legend.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await legend.tap();
      await expect(legend).toHaveAttribute("aria-pressed", "false");
      await expect(rolling.locator(".scatterlayer .trace")).toHaveCount(2);
      await legend.tap();
      await expect(rolling.locator(".scatterlayer .trace")).toHaveCount(3);
      const plotArea = rolling.locator(".nsewdrag");
      await plotArea.scrollIntoViewIfNeeded();
      const bounds = (await plotArea.boundingBox())!;
      const client = await page.context().newCDPSession(page);
      const beforeScroll = await page.evaluate(() => scrollY);
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + bounds.height / 2;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 10; i++) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - i * 12 }],
        });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            ),
        );
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(() => page.evaluate(() => scrollY))
        .toBeGreaterThan(beforeScroll + 20);
      await plotArea.tap();
      await expect(rolling.locator(".hoverlayer")).toContainText("Gold");
      await expect(rolling.locator(".hoverlayer .hovertext")).toHaveCount(0);
      await rolling.getByRole("button", { name: "Zoom", exact: true }).tap();
      await expect(rolling).toHaveClass(/is-zooming/);
      await rolling.getByRole("button", { name: "Reset", exact: true }).tap();
      await expect(rolling).not.toHaveClass(/is-zooming/);
      const download = page.waitForEvent("download");
      await rolling
        .getByRole("button", { name: "Save PNG", exact: true })
        .tap();
      expect((await download).suggestedFilename()).toBe(
        "quant-wannabe-rolling.png",
      );
      await expect(page.locator(".math-block .katex-mathml")).toHaveCount(2);
      await expect(page.locator(".katex-error")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".math-block")
          .evaluateAll((elements) =>
            elements.every((el) => el.scrollWidth <= el.clientWidth),
          ),
      ).toBe(true);
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(1);
      await expect(page.locator(".touch-toolbar")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});

test("performance periods, ranking and calendar heatmap agree", async ({
  page,
}) => {
  await page.route("**/api/correlations", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/performance");
  await expect(page).toHaveTitle("Market performance | Quant Wannabe");
  const cumulative = page.locator('[data-kind="cumulative"]');
  await expect(cumulative).toHaveAttribute("aria-busy", "false");
  await expect(page.locator('nav [aria-current="page"]')).toHaveText(
    "Performance",
  );
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await expect
    .poll(() =>
      cumulative
        .locator(".js-plotly-plot")
        .evaluate(
          (el) =>
            (el as HTMLElement & { data: { x: string[] }[] }).data[0].x.length,
        ),
    )
    .toBe(31);
  await expect(page.locator(".chart-footnote")).toContainText(
    /27 Sept? 2026.*27 Oct 2026/,
  );
  const gold = page
    .getByRole("region", { name: "Return ranking table", exact: true })
    .getByRole("row")
    .filter({ hasText: "Gold" });
  const plottedReturn = await cumulative
    .locator(".js-plotly-plot")
    .evaluate((el) => {
      const trace = (
        el as HTMLElement & { data: { name: string; y: number[] }[] }
      ).data.find((s) => s.name === "Gold")!;
      return (trace.y.at(-1)! - 1) * 100;
    });
  await expect(gold).toContainText(Math.abs(plottedReturn).toFixed(2));
  await expect(
    page.getByRole("region", { name: "Return ranking table", exact: true }),
  ).toContainText("Data unavailable");
  const heatmap = page.getByRole("region", { name: "2026 monthly returns" });
  await expect(
    heatmap.getByRole("cell", { name: "Bitcoin, Oct 2026:", exact: false }),
  ).toHaveText("—");
  await expect(
    heatmap.getByRole("cell", { name: "Bitcoin, Sep 2026:", exact: false }),
  ).toContainText("%");
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: "test-results/performance-desktop.png",
    fullPage: true,
  });
});

test("risk charts expose correct axes, windows and working chart actions", async ({
  page,
}) => {
  await page.route("**/api/correlations", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/risk");
  await expect(page).toHaveTitle("Risk & drawdown | Quant Wannabe");
  await expect(page.locator('nav [aria-current="page"]')).toHaveText("Risk");
  await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(2);
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "90 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".chart-footnote").nth(1)).toContainText(
    "Trailing 90",
  );
  for (const kind of ["drawdown", "volatility"]) {
    const chart = page.locator(`[data-kind="${kind}"]`);
    await expect(chart).toHaveAttribute("aria-busy", "false");
    const values = await chart.locator(".js-plotly-plot").evaluate((el) => {
      const plot = el as HTMLElement & {
        data: { y: (number | null)[]; line: { width: number } }[];
        layout: { yaxis: { title: { text: string } } };
      };
      return {
        values: plot.data.flatMap((s) => s.y).filter((v) => v !== null),
        widths: plot.data.map((s) => s.line.width),
        axis: plot.layout.yaxis.title.text,
      };
    });
    expect(values.widths.every((width) => width === 1.25)).toBe(true);
    expect(
      values.values.every((v) => (kind === "drawdown" ? v! <= 0 : v! >= 0)),
    ).toBe(true);
    expect(values.axis).toContain("%");
    await chart.locator(".legendtoggle").first().click();
    await expect(chart.locator(".scatterlayer .trace")).toHaveCount(3);
    await chart.locator(".legendtoggle").first().click();
    await expect(chart.locator(".scatterlayer .trace")).toHaveCount(4);
    await chart.locator('[data-title="Zoom in"]').click();
    await chart.locator('[data-title="Reset axes"]').click();
    const download = page.waitForEvent("download");
    await chart.locator('[data-title="Download plot as a PNG"]').click();
    expect((await download).suggestedFilename()).toBe(
      `quant-wannabe-${kind}.png`,
    );
  }
  await expect(
    page.getByRole("region", { name: "Risk by asset table", exact: true }),
  ).toContainText("Data unavailable");
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: "test-results/risk-desktop.png",
    fullPage: true,
  });
});

test("partial failures recover and new pages handle insufficient history", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/correlations", (route) => {
    attempts++;
    return route.fulfill({
      json:
        attempts === 1
          ? {
              ...fixture,
              assets: fixture.assets.map((a) =>
                a.id === "gold" ? { ...a, status: "error", candles: [] } : a,
              ),
            }
          : { ...fixture, btc: fixture.btc.slice(-2), assets: [] },
    });
  });
  await page.goto("/risk");
  await expect(page.getByRole("alert")).toContainText(
    "Some markets could not be loaded",
  );
  await expect(
    page.getByRole("region", { name: "Risk by asset table", exact: true }),
  ).toContainText("Could not load data");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".chart-empty")).toContainText(
    "Not enough history",
  );
  await page.getByRole("link", { name: "Performance", exact: true }).click();
  await expect(page.locator('[data-kind="cumulative"]')).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.locator(".heatmap").getByRole("cell").filter({ hasText: "%" }),
  ).toHaveCount(0);
});

test.describe("new pages on touch screens", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const route of ["performance", "risk"]) {
    for (const width of [320, 390]) {
      test(`${route} at ${width}px wraps navigation and keeps tables contained`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.route("**/api/correlations", (route) =>
          route.fulfill({ json: fixture }),
        );
        await page.goto(`/${route}`);
        await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(
          route === "risk" ? 2 : 1,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const chart = page.locator(".plot-shell").first();
        const toggle = chart.getByRole("button", {
          name: "Bitcoin",
          exact: true,
        });
        await toggle.tap();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await toggle.tap();
        await chart.locator(".nsewdrag").tap();
        await expect(chart.locator(".hoverlayer")).toContainText("Bitcoin");
        await chart.getByRole("button", { name: "Zoom", exact: true }).tap();
        await expect(chart).toHaveClass(/is-zooming/);
        await chart.getByRole("button", { name: "Reset", exact: true }).tap();
        await expect(chart).not.toHaveClass(/is-zooming/);
        const download = page.waitForEvent("download");
        await chart
          .getByRole("button", { name: "Save PNG", exact: true })
          .tap();
        expect((await download).suggestedFilename()).toContain(
          route === "risk" ? "drawdown" : "cumulative",
        );
        await page.getByRole("heading", { level: 1 }).click();
        await page.screenshot({
          path: `test-results/${route}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }
});
