import katex from "katex";
import { useMemo } from "react";

/** Use String.raw for TeX expressions so backslashes need no extra escaping. */
export default function MathFormula({
  tex,
  display = false,
}: {
  tex: string;
  display?: boolean;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        output: "htmlAndMathml",
        throwOnError: false,
        trust: false,
        strict: "warn",
      }),
    [tex, display],
  );
  return (
    <span
      className={display ? "math-formula math-block" : "math-formula"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
