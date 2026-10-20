/**
 * 图表数据映射(纯函数):BacktestResult → lightweight-charts 可用结构,
 * 以及 WebView 注入用完整 HTML 文档(初始化脚本由 F3 的 chartInitScript
 * 产出、经 buildChartHtml 第二参注入)。
 */
import type { BacktestResult, KdjSeries, MacdSeries, Trade } from "../api/types";

/** 单根 K 线(CandlestickSeries 数据点,time=YYYY-MM-DD) */
export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 单点折线(LineSeries 数据点) */
export interface LinePoint {
  time: string;
  value: number;
}

/** 买卖点标记(Marker 数据) */
export interface TradeMarker {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowDown" | "arrowUp";
  text: string;
}

/** MACD 柱点(hist≥0 红 / <0 绿,国内约定红涨绿跌) */
export interface HistogramPoint {
  time: string;
  value: number;
  color: string;
}

/** WebView 注入的图表数据包(buildChartPayload 输出) */
export interface ChartPayload {
  candles: CandlePoint[];
  emaFast?: number[];
  emaSlow?: number[];
  macd?: MacdSeries;
  /** macd 柱预映射点(toHistogramMacd 产物,含红涨绿跌颜色;与 macd 同时出现) */
  macdHist?: HistogramPoint[];
  kdj?: KdjSeries;
  /** 交易标记(toMarkers 产物,candles 主图叠加;无成交时缺省) */
  markers?: TradeMarker[];
  /** 三线对比序列:均为累计收益率 %(spec §7 同轴口径),起点 0 */
  lines: { equity: number[]; position: number[]; benchmark: number[] };
  times: string[];
}

/** 买点:绿、上箭头、柱下 */
const BUY_MARKER = {
  position: "belowBar",
  color: "#26a69a",
  shape: "arrowUp",
  text: "B",
} as const;

/** 卖点:红、下箭头、柱上 */
const SELL_MARKER = {
  position: "aboveBar",
  color: "#ef5350",
  shape: "arrowDown",
  text: "S",
} as const;

/** hist≥0 用红(涨),<0 用绿(跌) */
function histColor(hist: number): string {
  return hist >= 0 ? "#ef5350" : "#26a69a";
}

/** K 线数组映射(time 取 dates[i],OHLC 按位对齐) */
export function toCandles(result: BacktestResult): CandlePoint[] {
  const { dates, open, high, low, close } = result.candles;
  return dates.map((time, i) => ({
    time,
    open: open[i],
    high: high[i],
    low: low[i],
    close: close[i],
  }));
}

/** 折线映射:values[i] 对应 times[i],长度不齐截短到 min */
export function toLine(times: string[], values: number[]): LinePoint[] {
  const n = Math.min(times.length, values.length);
  return times.slice(0, n).map((time, i) => ({ time, value: values[i] }));
}

/** 交易标记:buy→belowBar/arrowUp/绿"B",sell→aboveBar/arrowDown/红"S",保序 */
export function toMarkers(trades: Trade[]): TradeMarker[] {
  return trades.map((trade) => {
    const isBuy = trade.direction === "buy";
    const base = isBuy ? BUY_MARKER : SELL_MARKER;
    return { time: trade.time, ...base };
  });
}

/** MACD 柱映射:value=hist[i],颜色按正负分界,长度按 min(hist, times) 截短 */
export function toHistogramMacd(
  sub: { dif: number[]; dea: number[]; hist: number[] },
  times: string[],
): HistogramPoint[] {
  const n = Math.min(sub.hist.length, times.length);
  return times.slice(0, n).map((time, i) => ({
    time,
    value: sub.hist[i],
    color: histColor(sub.hist[i]),
  }));
}

/**
 * 绝对资金额序列 → 相对 initial_capital 的累计收益率 %(spec §7 三线同轴口径):
 * (v / 本金 - 1) × 100,起点为 0。
 */
function toCumReturnPct(values: number[], initialCapital: number): number[] {
  return values.map((v) => (v / initialCapital - 1) * 100);
}

/**
 * 打包图表数据包:candles + 可选 ema/macd/kdj + 三线对比序列 + 时间轴。
 * 三线统一为累计收益率 % 同轴:equity/position_value 由绝对资金额除以 initial_capital
 * 归一化,benchmark 后端已是累计收益率 % 原样透传;字段名
 * lines.equity/lines.position/lines.benchmark;times 取 candles.dates。
 * 形态缺省的键(overlays/sub 不存在)不出现在对象里,JSON 序列化后消失。
 */
export function buildChartPayload(result: BacktestResult): ChartPayload {
  const overlays = result.candles.overlays;
  const sub = result.candles.sub;
  const capital = result.request.initial_capital;
  return {
    candles: toCandles(result),
    ...(overlays?.ema_fast !== undefined ? { emaFast: overlays.ema_fast } : {}),
    ...(overlays?.ema_slow !== undefined ? { emaSlow: overlays.ema_slow } : {}),
    ...(sub?.macd !== undefined
      ? { macd: sub.macd, macdHist: toHistogramMacd(sub.macd, result.candles.dates) }
      : {}),
    ...(sub?.kdj !== undefined ? { kdj: sub.kdj } : {}),
    ...(result.trades.length > 0 ? { markers: toMarkers(result.trades) } : {}),
    lines: {
      equity: toCumReturnPct(result.curves.equity, capital),
      position: toCumReturnPct(result.curves.position_value, capital),
      benchmark: result.curves.benchmark,
    },
    times: result.candles.dates,
  };
}

/** 初始化脚本占位符,F3 chart-init-script.ts 用 .replace 换成真正的初始化代码 */
export const INIT_PLACEHOLDER = "/*__INIT__*/";

const CDN_SCRIPT_TAG =
  '<script src="https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"></script>';

/**
 * 生成 WebView 注入用完整 HTML:CDN 引入 lightweight-charts 5.2.1 +
 * `const PAYLOAD = <json>;` + 初始化脚本。
 * F3 升级为双参:`initScript` 为 chartInitScript(kind) 的产物,原样替换
 * INIT_PLACEHOLDER;缺省保持占位符(F2 单参调用点行为逐字节不变)。
 * JSON 里的 `<` 全部转义为 `\\u003c`,防 `</script>` 提前闭合标签逃逸。
 */
export function buildChartHtml(payload: object, initScript: string = INIT_PLACEHOLDER): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    CDN_SCRIPT_TAG,
    "</head>",
    '<body style="margin:0">',
    '<div id="chart" style="width:100%;height:100vh"></div>',
    `<script>const PAYLOAD = ${json};${initScript}</script>`,
    "</body></html>",
  ].join("");
}
