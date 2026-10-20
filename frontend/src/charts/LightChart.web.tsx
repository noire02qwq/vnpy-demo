/**
 * LightChart web 实现:lightweight-charts v5(npm 包)直挂 DOM。
 * 仅 web 平台经 Metro 平台扩展(LightChart.web.tsx)加载,native 侧永不打包。
 * 数据(同一 ChartPayload)与配色/高度(CHART_COLORS/CHART_HEIGHT)与
 * WebView 脚本(chart-init-script)严格同源,保证三端渲染语义一致。
 */
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import type { IChartApi, LineSeriesPartialOptions } from "lightweight-charts";
import { buildChartPayload, toLine } from "./chart-data";
import type { ChartPayload } from "./chart-data";
import { CHART_COLORS, CHART_HEIGHT } from "./chart-init-script";
import type { ChartKind } from "./chart-init-script";
import type { BacktestResult } from "../api/types";

/** 组件契约(brief Interfaces 行);kind 为含内部 lines 模式的超集 */
export interface LightChartProps {
  kind: ChartKind;
  result: BacktestResult;
}

/** 折线公共样式(与脚本的 line() 同构:细线、隐藏价格线与末值标签) */
function lineOptions(color: string): LineSeriesPartialOptions {
  return { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false };
}

/** 按 kind 组装 series(与 chart-init-script 的 BUILDERS 一一对应) */
function applySeries(chart: IChartApi, payload: ChartPayload, kind: ChartKind): void {
  if (kind === "candles") {
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      borderVisible: false,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
    });
    candles.setData(payload.candles);
    if (payload.emaFast?.length) {
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.fast))
        .setData(toLine(payload.times, payload.emaFast));
    }
    if (payload.emaSlow?.length) {
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.slow))
        .setData(toLine(payload.times, payload.emaSlow));
    }
    if (payload.markers?.length) {
      createSeriesMarkers(candles, payload.markers);
    }
    return;
  }
  if (kind === "macd") {
    if (payload.macdHist?.length) {
      chart
        .addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false })
        .setData(payload.macdHist);
    }
    if (payload.macd) {
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.fast))
        .setData(toLine(payload.times, payload.macd.dif));
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.slow))
        .setData(toLine(payload.times, payload.macd.dea));
    }
    return;
  }
  if (kind === "kdj") {
    if (payload.kdj) {
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.fast))
        .setData(toLine(payload.times, payload.kdj.k));
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.slow))
        .setData(toLine(payload.times, payload.kdj.d));
      chart
        .addSeries(LineSeries, lineOptions(CHART_COLORS.kdjJ))
        .setData(toLine(payload.times, payload.kdj.j));
    }
    return;
  }
  chart
    .addSeries(LineSeries, lineOptions(CHART_COLORS.equity))
    .setData(toLine(payload.times, payload.lines.equity));
  chart
    .addSeries(LineSeries, lineOptions(CHART_COLORS.position))
    .setData(toLine(payload.times, payload.lines.position));
  chart
    .addSeries(LineSeries, lineOptions(CHART_COLORS.benchmark))
    .setData(toLine(payload.times, payload.lines.benchmark));
}

export function LightChart({ kind, result }: LightChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#333333" },
      grid: { vertLines: { color: "#eeeeee" }, horzLines: { color: "#eeeeee" } },
      timeScale: { borderColor: "#dddddd" },
      rightPriceScale: { borderColor: "#dddddd" },
    });
    applySeries(chart, buildChartPayload(result), kind);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
    };
  }, [kind, result]);
  return <div ref={ref} style={{ width: "100%", height: CHART_HEIGHT[kind] }} />;
}
