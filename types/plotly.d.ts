declare module "plotly.js-basic-dist-min" {
  import * as PlotlyTypes from "plotly.js";
  const Plotly: typeof PlotlyTypes & {
    Fx: {
      hover(
        graph: HTMLElement,
        points:
          | { curveNumber: number; pointNumber: number }[]
          | { xval: number; hovermode: "x unified" },
      ): void;
    };
  };
  export = Plotly;
}
