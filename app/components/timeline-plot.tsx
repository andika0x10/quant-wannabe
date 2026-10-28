"use client";

import { useEffect, useRef, useState } from "react";
import type { TimeSeries } from "../../lib/correlations";
import type { Data, PlotlyHTMLElement } from "plotly.js";
import { SERIES_COLORS, SERIES_LINE_WIDTH } from "../../lib/chart-settings";

export default function TimelinePlot({
  series,
  kind,
}: {
  series: TimeSeries[];
  kind: "rolling" | "cumulative" | "drawdown" | "volatility";
}) {
  const labels = {
    rolling: {
      axis: "Pearson r",
      hover: "%{y:.3f}",
      description: "Rolling Pearson correlation with Bitcoin",
    },
    cumulative: {
      axis: "Growth of 1×",
      hover: "%{y:.3f}×",
      description: "Cumulative returns starting at one",
    },
    drawdown: {
      axis: "Drawdown (%)",
      hover: "%{y:.2f}%",
      description: "Drawdown from historical peak",
    },
    volatility: {
      axis: "Annualized volatility (%)",
      hover: "%{y:.2f}%",
      description: "Rolling annualized volatility",
    },
  }[kind];
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLDivElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px), (pointer: coarse)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    setLoading(true);
    setError(false);
    setZooming(false);
    setHidden([]);
    setActionError("");
    async function draw() {
      const Plotly = await import("plotly.js-basic-dist-min").then(
        (m) => m.default,
      );
      const parent = container.current;
      if (cancelled || !parent) return;
      // Each effect owns its node so an older asynchronous draw cannot purge a newer chart.
      const el = document.createElement("div");
      el.style.width = "100%";
      el.style.height = "100%";
      parent.replaceChildren(el);
      graph.current = el;
      const small = mobile;
      await Plotly.newPlot(
        el,
        series.map((s) => ({
          type: "scatter",
          mode:
            s.points.filter((point) => point.value !== null).length === 1
              ? "lines+markers"
              : "lines",
          name: s.name,
          x: s.points.map((p) => p.date),
          y: s.points.map((p) => p.value),
          connectgaps: false,
          line: {
            color: SERIES_COLORS[s.id],
            dash: "solid",
            width: SERIES_LINE_WIDTH,
          },
          marker: { color: SERIES_COLORS[s.id], size: 5 },
          hovertemplate: `${labels.hover}<extra>%{fullData.name}</extra>`,
        })) as Data[],
        {
          autosize: true,
          paper_bgcolor: "#fff",
          plot_bgcolor: "#fff",
          margin: {
            t: small ? 16 : 44,
            r: small ? 10 : 16,
            b: 42,
            l: small ? 43 : 55,
          },
          showlegend: !mobile,
          font: {
            family: "Instrument Sans, sans-serif",
            color: "#666666",
            size: 12,
          },
          legend: {
            orientation: "h",
            x: 0,
            y: 1.18,
            xanchor: "left",
            yanchor: "top",
            font: { size: small ? 11 : 12 },
          },
          xaxis: {
            type: "date",
            gridcolor: "#f0f0f0",
            zeroline: false,
            hoverformat: "%d %b %Y",
            nticks: small ? 4 : 9,
          },
          yaxis: {
            title: {
              text: labels.axis,
              standoff: 10,
            },
            range: kind === "rolling" ? [-1.05, 1.05] : undefined,
            ticksuffix:
              kind === "cumulative" ? "×" : kind === "rolling" ? "" : "%",
            rangemode:
              kind === "volatility" || kind === "drawdown"
                ? "tozero"
                : "normal",
            gridcolor: "#f0f0f0",
            zerolinecolor: "#aaa",
            dtick: kind === "rolling" ? 0.5 : undefined,
          },
          hovermode: "x unified",
          hoverlabel: {
            bgcolor: "#fff",
            bordercolor: "#dedede",
            font: { family: "Instrument Sans, sans-serif", color: "#171717" },
          },
          dragmode: mobile ? false : "zoom",
          shapes:
            kind === "cumulative"
              ? [
                  {
                    type: "line",
                    xref: "paper",
                    x0: 0,
                    x1: 1,
                    y0: 1,
                    y1: 1,
                    line: { color: "#bcbcbc", width: 1, dash: "dot" },
                  },
                ]
              : [],
        },
        {
          responsive: true,
          displaylogo: false,
          displayModeBar: !mobile,
          scrollZoom: false,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "pan2d"],
          toImageButtonOptions: {
            format: "png",
            filename: `quant-wannabe-${kind}`,
            scale: 2,
          },
        },
      );
      if (cancelled) {
        Plotly.purge(el);
        return;
      }
      const observer = new ResizeObserver(() => {
        void Plotly.Plots.resize(el);
      });
      observer.observe(el);
      cleanup = () => {
        observer.disconnect();
        Plotly.purge(el);
        if (graph.current === el) graph.current = null;
      };
      setLoading(false);
    }
    draw().catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [series, kind, attempt, mobile]);

  async function chartAction(
    action: "zoom" | "reset" | "download" | "toggle",
    index = 0,
  ) {
    const el = graph.current;
    if (!el || loading) return;
    setActionError("");
    try {
      const Plotly = await import("plotly.js-basic-dist-min").then(
        (m) => m.default,
      );
      if (action === "toggle") {
        const id = series[index].id;
        const isHidden = hidden.includes(id);
        await Plotly.restyle(el, { visible: isHidden ? true : "legendonly" }, [
          index,
        ]);
        setHidden((previous) =>
          isHidden
            ? previous.filter((value) => value !== id)
            : [...previous, id],
        );
      } else if (action === "zoom") {
        await Plotly.relayout(el, { dragmode: zooming ? false : "zoom" });
        setZooming(!zooming);
      } else if (action === "reset") {
        await Plotly.relayout(el, {
          "xaxis.autorange": true,
          ...(kind === "rolling"
            ? { "yaxis.range": [-1.05, 1.05], "yaxis.autorange": false }
            : { "yaxis.autorange": true }),
          dragmode: false,
        });
        setZooming(false);
      } else {
        setDownloading(true);
        await Plotly.downloadImage(el, {
          format: "png",
          filename: `quant-wannabe-${kind}`,
          scale: 2,
          width: 1200,
          height: 500,
        });
      }
    } catch {
      setActionError("That chart action failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function inspectDate(clientX: number, clientY: number) {
    const el = graph.current;
    if (!mobile || zooming || loading || !el) return;
    const bounds = el.querySelector(".nsewdrag")?.getBoundingClientRect();
    const range = (el as unknown as PlotlyHTMLElement).layout.xaxis?.range;
    if (
      !bounds ||
      !range ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    )
      return;
    const first = new Date(range[0]).getTime(),
      last = new Date(range[1]).getTime();
    const time =
      first + ((clientX - bounds.left) / bounds.width) * (last - first);
    try {
      const Plotly = await import("plotly.js-basic-dist-min").then(
        (m) => m.default,
      );
      Plotly.Fx.hover(el, { xval: time, hovermode: "x unified" });
    } catch {
      setActionError("Could not inspect this date. Tap again to retry.");
    }
  }
  return (
    <div
      className={`plot-shell ${zooming ? "is-zooming" : ""}`}
      aria-busy={loading}
      data-kind={kind}
    >
      {mobile && (
        <>
          <div
            className="touch-legend"
            role="group"
            aria-label="Visible assets"
          >
            {series.map((s, index) => (
              <button
                key={s.id}
                disabled={loading || error}
                aria-pressed={!hidden.includes(s.id)}
                onClick={() => void chartAction("toggle", index)}
              >
                <span
                  className={`series-swatch swatch-${s.id}`}
                  style={{ borderColor: SERIES_COLORS[s.id] }}
                  aria-hidden="true"
                />
                {s.name}
              </button>
            ))}
          </div>
          <div
            className="touch-toolbar"
            role="group"
            aria-label="Chart controls"
          >
            <button
              disabled={loading || error}
              aria-pressed={zooming}
              onClick={() => void chartAction("zoom")}
            >
              Zoom
            </button>
            <button
              disabled={loading || error}
              onClick={() => void chartAction("reset")}
            >
              Reset
            </button>
            <button
              disabled={loading || error || downloading}
              onClick={() => void chartAction("download")}
            >
              {downloading ? "Saving…" : "Save PNG"}
            </button>
          </div>
          <p className="touch-hint" aria-live="polite">
            {zooming
              ? "Drag across the chart to zoom. Tap Reset to scroll again."
              : "Tap a line to inspect. Swipe up or down to scroll."}
          </p>
        </>
      )}
      <div
        ref={container}
        className="timeline-plot"
        onTouchStartCapture={(event) => {
          // Plotly cancels native touch scrolling even with dragmode disabled.
          // Keep the browser's default gesture; tap inspection is handled below.
          if (mobile && !zooming) event.stopPropagation();
        }}
        onClick={(event) => {
          void inspectDate(event.clientX, event.clientY);
        }}
        role="img"
        aria-label={`${labels.description} over time: ${series.map((s) => s.name).join(", ")}. Use the legend to toggle lines.`}
      />
      {actionError && (
        <p className="chart-action-error" role="alert">
          {actionError}
        </p>
      )}
      {loading && (
        <div className="plot-overlay" role="status">
          Preparing the chart…
        </div>
      )}
      {error && (
        <div className="plot-overlay" role="alert">
          <p>The chart could not be loaded.</p>
          <button
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
