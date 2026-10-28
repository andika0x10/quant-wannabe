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

test("all comparison lines share one rolling chart and all prices share one cumulative chart", async ({
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
  await expect(plots).toHaveCount(2);
  await expect(page.locator(".site-header svg, .site-header img")).toHaveCount(
    0,
  );
  const rolling = page.locator('[data-kind="rolling"]');
  const cumulative = page.locator('[data-kind="cumulative"]');
  await expect(rolling.locator(".legendtext")).toHaveText([
    "Gold",
    "S&P 500",
    "Oil (Brent)",
  ]);
  await expect(cumulative.locator(".legendtext")).toHaveText([
    "Bitcoin",
    "Gold",
    "S&P 500",
    "Oil (Brent)",
  ]);
  const readLines = (plot: typeof rolling) =>
    plot.locator(".js-plotly-plot").evaluate((el) =>
      (
        el as HTMLElement & {
          data: { name: string; line: { color: string; dash: string } }[];
        }
      ).data.map((s) => ({ name: s.name, ...s.line })),
    );
  const rollingLines = await readLines(rolling);
  const cumulativeLines = await readLines(cumulative);
  expect(new Set(cumulativeLines.map((line) => line.color)).size).toBe(
    cumulativeLines.length,
  );
  for (const line of rollingLines) {
    expect(line.color).toBe(
      cumulativeLines.find((other) => other.name === line.name)?.color,
    );
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
  await expect(cumulative).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "90 days", exact: true }).click();
  await expect(rolling).toHaveAttribute("aria-busy", "false");
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
  await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(2);
  await expect(page.locator(".math-block .katex")).toHaveCount(3);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("mobile keeps both multi-line plots visible without overflow and supports keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/correlations", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto("/");
  await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Quant Wannabe." }),
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
      await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(2);
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
      await expect(page.locator(".math-block .katex-mathml")).toHaveCount(3);
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
      await expect(page.locator(".plot-shell[aria-busy=false]")).toHaveCount(2);
      await expect(page.locator(".touch-toolbar")).toHaveCount(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
