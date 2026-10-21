import { buildChartHtml, buildChartPayload, toHistogramMacd, toMarkers } from "../src/charts/chart-data";
import type { BacktestRequest, BacktestResult, MacdSeries } from "../src/api/types";
import { CHART_COLORS, chartInitScript } from "../src/charts/chart-init-script";
import type { ChartKind } from "../src/charts/chart-init-script";

const request: BacktestRequest = {
  symbol: "600519.SS",
  start: "2024-01-01",
  end: "2024-12-31",
  initial_capital: 1_000_000,
  strategy: { type: "macd_cross", entry_pct: 100, entry_basis: "total" },
  benchmark_symbol: "^GSPC",
  cost: { commission_rate: 0.001, slippage: 0.01 },
  warmup_bars: 30,
};

/** 3 根 bar 迷你 fixture(与 chart-data.test 同构,另带 trades 供 markers 断言) */
function makeResult(candleOverrides: Partial<BacktestResult["candles"]> = {}): BacktestResult {
  return {
    id: "run-f3",
    request,
    metrics: { total_return: 0.12 },
    curves: {
      dates: ["2024-01-02", "2024-01-03", "2024-01-04"],
      equity: [1_000_000, 1_010_000, 1_005_000],
      position_value: [0, 500_000, 480_000],
      benchmark: [0, 1.2, 0.8],
    },
    candles: {
      dates: ["2024-01-02", "2024-01-03", "2024-01-04"],
      open: [10, 11, 10.5],
      high: [11, 11.5, 11],
      low: [9.5, 10.5, 10],
      close: [10.5, 11, 10.2],
      volume: [1000, 1200, 800],
      ...candleOverrides,
    },
    trades: [],
  };
}

describe("chartInitScript", () => {
  it.each<[ChartKind, string[]]>([
    [
      "candles",
      [
        "LightweightCharts.createChart",
        "LightweightCharts.CandlestickSeries",
        "PAYLOAD.candles",
        "PAYLOAD.emaFast",
        "PAYLOAD.emaSlow",
        "LightweightCharts.createSeriesMarkers",
        "zip(PAYLOAD.times",
      ],
    ],
    [
      "macd",
      [
        "LightweightCharts.createChart",
        "LightweightCharts.HistogramSeries",
        "PAYLOAD.macdHist",
        "PAYLOAD.macd.dif",
        "PAYLOAD.macd.dea",
        "zip(PAYLOAD.times",
      ],
    ],
    [
      "kdj",
      [
        "LightweightCharts.createChart",
        "LightweightCharts.LineSeries",
        "PAYLOAD.kdj.k",
        "PAYLOAD.kdj.d",
        "PAYLOAD.kdj.j",
        "zip(PAYLOAD.times",
      ],
    ],
    [
      "lines",
      [
        "LightweightCharts.createChart",
        "LightweightCharts.LineSeries",
        "PAYLOAD.lines.equity",
        "PAYLOAD.lines.position",
        "PAYLOAD.lines.benchmark",
        "zip(PAYLOAD.times",
      ],
    ],
  ])("%s 脚本包含对应 series 关键字与 createChart 调用", (kind, keywords) => {
    const script = chartInitScript(kind);
    for (const keyword of keywords) {
      expect(script).toContain(keyword);
    }
  });

  it("脚本为 IIFE 自封装,不向全局泄漏变量", () => {
    expect(chartInitScript("lines").trim().startsWith("(function(){")).toBe(true);
    expect(chartInitScript("lines").trim().endsWith("})();")).toBe(true);
  });

  it("形态之间不串味:macd 无 CandlestickSeries,kdj 无 HistogramSeries", () => {
    expect(chartInitScript("macd")).not.toContain("CandlestickSeries");
    expect(chartInitScript("kdj")).not.toContain("HistogramSeries");
    expect(chartInitScript("kdj")).not.toContain("createSeriesMarkers");
  });

  it("配色与共享调色板 CHART_COLORS 同源", () => {
    expect(chartInitScript("candles")).toContain(CHART_COLORS.up);
    expect(chartInitScript("candles")).toContain(CHART_COLORS.fast);
    expect(chartInitScript("kdj")).toContain(CHART_COLORS.kdjJ);
    expect(chartInitScript("lines")).toContain(CHART_COLORS.equity);
    expect(chartInitScript("lines")).toContain(CHART_COLORS.position);
    expect(chartInitScript("lines")).toContain(CHART_COLORS.benchmark);
  });
});

describe("buildChartHtml 注入(F3 签名升级)", () => {
  it("传入 initScript:占位符被替换且脚本整体进入 <script>", () => {
    const script = chartInitScript("candles");
    const html = buildChartHtml({ times: ["2024-01-02"] }, script);
    expect(html).not.toContain("/*__INIT__*/");
    expect(html).toContain(script);
    // 脚本紧跟 PAYLOAD 之后、同一 <script> 内
    expect(html).toContain('</script>');
    expect(html).toContain(`;</script>`);
    expect(html.indexOf("const PAYLOAD = ")).toBeLessThan(html.indexOf("(function(){"));
  });

  it("单参调用保持旧占位语义(向后兼容)", () => {
    expect(buildChartHtml({ times: ["2024-01-02"] })).toContain("/*__INIT__*/");
  });

  it("图表主题对齐琥珀 token(深底/暗网格,不再白底)", () => {
    const html = buildChartHtml(
      { times: ["2024-01-02"] },
      chartInitScript("candles"),
    );
    expect(html).toContain("#0B0A08"); // 背景 base-950
    expect(html).toContain("#2C251B"); // 网格/时间轴 line
    expect(html).not.toContain("#ffffff");
    expect(html).not.toContain("#eeeeee");
  });
});

describe("buildChartPayload F3 扩展", () => {
  it("trades → markers(F2 toMarkers 形状)", () => {
    const result = makeResult();
    result.trades = [
      { time: "2024-01-02", direction: "buy", price: 10, volume: 100 },
      { time: "2024-01-03", direction: "sell", price: 11, volume: 100 },
    ];
    const payload = buildChartPayload(result);
    expect(payload.markers).toEqual(toMarkers(result.trades));
    expect(payload.markers?.[0]).toEqual({
      time: "2024-01-02",
      position: "belowBar",
      color: "#26a69a",
      shape: "arrowUp",
      text: "B",
    });
  });

  it("macd 形态 → macdHist 预映射点(红涨绿跌,与 toHistogramMacd 同构)", () => {
    const macd: MacdSeries = { dif: [1, 2, 3], dea: [1, 1, 1], hist: [0.5, -0.5, 0] };
    const payload = buildChartPayload(makeResult({ sub: { macd } }));
    expect(payload.macdHist).toEqual(toHistogramMacd(macd, payload.times));
    expect(payload.macdHist).toEqual([
      { time: "2024-01-02", value: 0.5, color: "#ef5350" },
      { time: "2024-01-03", value: -0.5, color: "#26a69a" },
      { time: "2024-01-04", value: 0, color: "#ef5350" },
    ]);
  });

  it("无形态结果(空 trades):markers/macdHist 键缺省", () => {
    const payload = buildChartPayload(makeResult());
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect("markers" in json).toBe(false);
    expect("macdHist" in json).toBe(false);
  });
});
