import {
  buildChartHtml,
  buildChartPayload,
  toCandles,
  toHistogramMacd,
  toLine,
  toMarkers,
} from "../src/charts/chart-data";
import type { ChartPayload } from "../src/charts/chart-data";
import type {
  BacktestRequest,
  BacktestResult,
  MacdSeries,
  Trade,
} from "../src/api/types";

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

/** 3 根 bar 迷你 fixture,按形态叠加 overlays/sub */
function makeResult(candleOverrides: Partial<BacktestResult["candles"]> = {}): BacktestResult {
  return {
    id: "run-f2",
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

describe("toCandles", () => {
  it("映射 3 根 bar,time 为 YYYY-MM-DD", () => {
    const bars = toCandles(makeResult());
    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({ time: "2024-01-02", open: 10, high: 11, low: 9.5, close: 10.5 });
    expect(bars[1]).toEqual({ time: "2024-01-03", open: 11, high: 11.5, low: 10.5, close: 11 });
    expect(bars[2]).toEqual({ time: "2024-01-04", open: 10.5, high: 11, low: 10, close: 10.2 });
  });
});

describe("toLine", () => {
  it("等长映射:values[i] 对应 times[i]", () => {
    const times = ["2024-01-02", "2024-01-03", "2024-01-04"];
    expect(toLine(times, [1, 2, 3])).toEqual([
      { time: "2024-01-02", value: 1 },
      { time: "2024-01-03", value: 2 },
      { time: "2024-01-04", value: 3 },
    ]);
  });

  it("values 比 times 长 → 截短到 min", () => {
    expect(toLine(["2024-01-02"], [1, 2, 3])).toEqual([{ time: "2024-01-02", value: 1 }]);
  });

  it("times 比 values 长 → 截短到 min", () => {
    expect(toLine(["2024-01-02", "2024-01-03"], [9])).toEqual([{ time: "2024-01-02", value: 9 }]);
  });
});

describe("toMarkers", () => {
  it("buy → belowBar/绿/arrowUp/B", () => {
    const trades: Trade[] = [{ time: "2024-01-02", direction: "buy", price: 10, volume: 100 }];
    expect(toMarkers(trades)).toEqual([
      { time: "2024-01-02", position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "B" },
    ]);
  });

  it("sell → aboveBar/红/arrowDown/S", () => {
    const trades: Trade[] = [{ time: "2024-01-03", direction: "sell", price: 11, volume: 100 }];
    expect(toMarkers(trades)).toEqual([
      { time: "2024-01-03", position: "aboveBar", color: "#ef5350", shape: "arrowDown", text: "S" },
    ]);
  });

  it("多笔保序", () => {
    const trades: Trade[] = [
      { time: "2024-01-02", direction: "buy", price: 10, volume: 100 },
      { time: "2024-01-03", direction: "sell", price: 11, volume: 100 },
      { time: "2024-01-04", direction: "buy", price: 10.2, volume: 200 },
    ];
    const markers = toMarkers(trades);
    expect(markers.map((m) => m.time)).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(markers.map((m) => m.text)).toEqual(["B", "S", "B"]);
  });
});

describe("toHistogramMacd", () => {
  it("hist ≥ 0 红 / < 0 绿(0 计红)", () => {
    const times = ["2024-01-02", "2024-01-03", "2024-01-04"];
    expect(toHistogramMacd({ dif: [1, 2, 3], dea: [1, 1, 1], hist: [0.5, -0.5, 0] }, times)).toEqual([
      { time: "2024-01-02", value: 0.5, color: "#ef5350" },
      { time: "2024-01-03", value: -0.5, color: "#26a69a" },
      { time: "2024-01-04", value: 0, color: "#ef5350" },
    ]);
  });

  it("hist 比 times 长 → 截短到 min", () => {
    expect(
      toHistogramMacd({ dif: [1, 2], dea: [1, 2], hist: [1, -1] }, ["2024-01-02"]),
    ).toEqual([{ time: "2024-01-02", value: 1, color: "#ef5350" }]);
  });
});

describe("buildChartPayload", () => {
  it("ema 形态(overlays 存在):含 emaFast/emaSlow", () => {
    const p: ChartPayload = buildChartPayload(
      makeResult({ overlays: { ema_fast: [1, 2, 3], ema_slow: [0.5, 1, 1.5] } }),
    );
    expect(p.emaFast).toEqual([1, 2, 3]);
    expect(p.emaSlow).toEqual([0.5, 1, 1.5]);
  });

  it("macd 形态(sub.macd 存在):含 macd{dif,dea,hist}", () => {
    const macd: MacdSeries = { dif: [1, 2, 3], dea: [1, 1, 1], hist: [0, 1, -1] };
    const p: ChartPayload = buildChartPayload(makeResult({ sub: { macd } }));
    expect(p.macd).toEqual(macd);
    expect(p.kdj).toBeUndefined();
  });

  it("kdj 形态(sub.kdj 存在):含 kdj{k,d,j}", () => {
    const kdj = { k: [1, 2, 3], d: [1, 1, 1], j: [1, 3, 5] };
    const p: ChartPayload = buildChartPayload(makeResult({ sub: { kdj } }));
    expect(p.kdj).toEqual(kdj);
    expect(p.macd).toBeUndefined();
  });

  it("turtle/dca 形态:ema/macd/kdj 键均缺省(JSON 序列化后键消失)", () => {
    const p = buildChartPayload(makeResult());
    const json = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    expect("emaFast" in json).toBe(false);
    expect("emaSlow" in json).toBe(false);
    expect("macd" in json).toBe(false);
    expect("kdj" in json).toBe(false);
  });

  it("lines 取 curves 三线(equity/position_value/benchmark),times 取 candles.dates", () => {
    const p: ChartPayload = buildChartPayload(makeResult());
    expect(p.lines).toEqual({
      equity: [1_000_000, 1_010_000, 1_005_000],
      position: [0, 500_000, 480_000],
      benchmark: [0, 1.2, 0.8],
    });
    expect(p.times).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
  });
});

describe("buildChartHtml", () => {
  const payload = { times: ["2024-01-02"], candles: [], evil: "</script><b>x</b>" };

  it("完整文档:含 DOCTYPE 与 lightweight-charts CDN script 标签", () => {
    const html = buildChartHtml(payload);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(
      '<script src="https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"></script>',
    );
  });

  it("JSON 中的 < 全部转义为 \\u003c,payload 段无裸 </script>", () => {
    const html = buildChartHtml(payload);
    expect(html).toContain("\\u003c");
    const match = /const PAYLOAD = (.*);/.exec(html);
    expect(match).not.toBeNull();
    const json = match?.[1] ?? "";
    expect(json).not.toContain("</script>");
    expect(json).not.toContain("<");
  });

  it("提取的 PAYLOAD JSON.parse 后与输入深度相等", () => {
    const html = buildChartHtml(payload);
    const match = /const PAYLOAD = (.*);/.exec(html);
    const parsed = JSON.parse(match?.[1] ?? "{}") as { evil: string; times: string[] };
    expect(parsed.evil).toBe("</script><b>x</b>");
    expect(parsed.times).toEqual(["2024-01-02"]);
  });

  it("包含 /*__INIT__*/ 初始化占位符", () => {
    expect(buildChartHtml(payload)).toContain("/*__INIT__*/");
  });
});
