/**
 * WebView 图表初始化脚本(纯函数):kind → 内联进 buildChartHtml 的 JS 语句串。
 *
 * 脚本运行在 standalone 版 lightweight-charts 环境(全局 `LightweightCharts`;
 * 5.2.1 standalone 实测导出 createChart / 系列工厂 CandlestickSeries·LineSeries·
 * HistogramSeries / createSeriesMarkers,与 npm 包同名 API 一致),操作
 * buildChartHtml 注入的全局 `PAYLOAD`。
 *
 * web 端(npm 包模块化 API)不共用本脚本,但渲染语义必须一致:
 * 数据同源(同一 ChartPayload),配色/高度同源(CHART_COLORS/CHART_HEIGHT)。
 * 脚本本体刻意用 ES5 语法,兼容旧 Android WebView。
 */
import type { BacktestResult } from "../api/types";

/** 图表形态:组件三态(candles/macd/kdj)+ ThreeLineChart 内部复用的 lines 模式 */
export type ChartKind = "candles" | "macd" | "kdj" | "lines";

/**
 * 全端共享调色板(红涨绿跌国内约定,与 F2 marker 配色一致)。
 * fast/slow 复用于 emaFast·macd.dif·kdj.k 与 emaSlow·macd.dea·kdj.d。
 */
export const CHART_COLORS = {
  /** 涨/阳线/买点 */
  up: "#26a69a",
  /** 跌/阴线/卖点 */
  down: "#ef5350",
  /** 快线:emaFast / macd.dif / kdj.k */
  fast: "#ff9800",
  /** 慢线:emaSlow / macd.dea / kdj.d */
  slow: "#2196f3",
  /** J 线 */
  kdjJ: "#9c27b0",
  /** 总资金 */
  equity: "#1e88e5",
  /** 持仓资金 */
  position: "#43a047",
  /** S&P500 基准 */
  benchmark: "#fb8c00",
} as const;

/** 各形态图表高度(px):candles 360、macd/kdj 200、lines(三线对比)260 */
export const CHART_HEIGHT: Record<ChartKind, number> = {
  candles: 360,
  macd: 200,
  kdj: 200,
  lines: 260,
};

/** LightChart 组件契约(brief Interfaces 行;kind 实现为含 lines 的超集供内部复用) */
export interface LightChartProps {
  kind: ChartKind;
  result: BacktestResult;
}

/** times×values 按位 zip,截短到 min(与 chart-data 的 toLine 同语义) */
const ZIP_HELPER =
  "function zip(times,values){var n=Math.min(times.length,values.length);" +
  "var out=[];for(var i=0;i<n;i++){out.push({time:times[i],value:values[i]});}return out;}";

/** 图表基础选项:自适应容器 + 浅色主题 */
const CHART_OPTIONS =
  'autoSize:true,' +
  // 琥珀终端 token:背景 base-950、文字 ink-dim、网格/轴 line(spec §4.1;仅主题色,系列配色不动)
  'layout:{background:{type:"solid",color:"#0B0A08"},textColor:"#9A8E78"},' +
  'grid:{vertLines:{color:"#2C251B"},horzLines:{color:"#2C251B"}},' +
  'timeScale:{borderColor:"#2C251B"},rightPriceScale:{borderColor:"#2C251B"}';

const CREATE_CHART =
  `var chart=LightweightCharts.createChart(document.getElementById("chart"),{${CHART_OPTIONS}});`;

/** 折线 series 表达式:细线、隐藏价格线与末值标签(辅助线不喧宾夺主) */
function line(color: string): string {
  return (
    `chart.addSeries(LightweightCharts.LineSeries,` +
    `{color:"${color}",lineWidth:1,priceLineVisible:false,lastValueVisible:false})`
  );
}

/** 各形态的 series 组装语句(与 LightChart.web.tsx 的 applySeries 一一对应) */
const BUILDERS: Record<ChartKind, string> = {
  candles:
    `var candles=chart.addSeries(LightweightCharts.CandlestickSeries,` +
    `{upColor:"${CHART_COLORS.up}",downColor:"${CHART_COLORS.down}",borderVisible:false,` +
    `wickUpColor:"${CHART_COLORS.up}",wickDownColor:"${CHART_COLORS.down}"});` +
    `candles.setData(PAYLOAD.candles);` +
    `if(PAYLOAD.emaFast&&PAYLOAD.emaFast.length){${line(CHART_COLORS.fast)}.setData(zip(PAYLOAD.times,PAYLOAD.emaFast));}` +
    `if(PAYLOAD.emaSlow&&PAYLOAD.emaSlow.length){${line(CHART_COLORS.slow)}.setData(zip(PAYLOAD.times,PAYLOAD.emaSlow));}` +
    `if(PAYLOAD.markers&&PAYLOAD.markers.length){LightweightCharts.createSeriesMarkers(candles,PAYLOAD.markers);}`,
  macd:
    `if(PAYLOAD.macdHist&&PAYLOAD.macdHist.length){` +
    `chart.addSeries(LightweightCharts.HistogramSeries,{priceLineVisible:false,lastValueVisible:false})` +
    `.setData(PAYLOAD.macdHist);}` +
    `if(PAYLOAD.macd){` +
    `${line(CHART_COLORS.fast)}.setData(zip(PAYLOAD.times,PAYLOAD.macd.dif));` +
    `${line(CHART_COLORS.slow)}.setData(zip(PAYLOAD.times,PAYLOAD.macd.dea));}`,
  kdj:
    `if(PAYLOAD.kdj){` +
    `${line(CHART_COLORS.fast)}.setData(zip(PAYLOAD.times,PAYLOAD.kdj.k));` +
    `${line(CHART_COLORS.slow)}.setData(zip(PAYLOAD.times,PAYLOAD.kdj.d));` +
    `${line(CHART_COLORS.kdjJ)}.setData(zip(PAYLOAD.times,PAYLOAD.kdj.j));}`,
  lines:
    `${line(CHART_COLORS.equity)}.setData(zip(PAYLOAD.times,PAYLOAD.lines.equity));` +
    `${line(CHART_COLORS.position)}.setData(zip(PAYLOAD.times,PAYLOAD.lines.position));` +
    `${line(CHART_COLORS.benchmark)}.setData(zip(PAYLOAD.times,PAYLOAD.lines.benchmark));`,
};

/**
 * 生成指定形态的初始化脚本:一段自封装 IIFE,建图 → 按 kind 组 series →
 * fitContent 铺满时间轴。仅供 WebView 使用。
 */
export function chartInitScript(kind: ChartKind): string {
  return (
    "(function(){" +
    ZIP_HELPER +
    CREATE_CHART +
    BUILDERS[kind] +
    "chart.timeScale().fitContent();" +
    "})();"
  );
}
