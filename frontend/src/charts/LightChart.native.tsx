/**
 * LightChart native 实现(iOS/Android):react-native-webview 加载同源 HTML
 * (buildChartHtml + chartInitScript,standalone 版 lightweight-charts 渲染)。
 * 仅 native 平台经 Metro 平台扩展(LightChart.native.tsx)加载,web 侧永不打包。
 * 渲染语义与 web 实现(LightChart.web.tsx)通过共享的 ChartPayload、
 * CHART_COLORS、CHART_HEIGHT 保持一致。
 */
import { useMemo } from "react";
import { WebView } from "react-native-webview";
import { buildChartHtml, buildChartPayload } from "./chart-data";
import { CHART_HEIGHT, chartInitScript } from "./chart-init-script";
import type { LightChartProps } from "./chart-init-script";

export type { LightChartProps } from "./chart-init-script";

export function LightChart({ kind, result }: LightChartProps) {
  const html = useMemo(
    () => buildChartHtml(buildChartPayload(result), chartInitScript(kind)),
    [kind, result],
  );
  return (
    <WebView
      source={{ html }}
      style={{ width: "100%", height: CHART_HEIGHT[kind] }}
      javaScriptEnabled
    />
  );
}
