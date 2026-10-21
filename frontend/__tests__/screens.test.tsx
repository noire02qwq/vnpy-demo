/**
 * screens 层直渲测试:三屏不依赖 expo-router(导航经 props 回调注入,双壳共源前提)。
 * - 网络层 mock 同 pages.test.tsx(requireActual 保留真实 errorMessage/ApiError);
 * - 图表层 mock react-native-webview;
 * - pages.test.tsx 保留:穿透 Expo 薄壳 + screen 的整链回归。
 */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("../src/api/client", () => {
  const actual = jest.requireActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    getStrategies: jest.fn<Promise<StrategyMeta[]>, []>(),
    runBacktest: jest.fn<Promise<BacktestResult>, [BacktestRequest]>(),
    getRun: jest.fn<Promise<BacktestResult>, [string]>(),
    listRuns: jest.fn<Promise<RunList>, [number, number]>(),
    deleteRun: jest.fn<Promise<void>, [string]>(),
  };
});

jest.mock("react-native-webview", () => ({ WebView: () => null }));

import { ConfigScreen } from "../src/screens/ConfigScreen";
import { HistoryScreen } from "../src/screens/HistoryScreen";
import { ResultScreen } from "../src/screens/ResultScreen";
import * as client from "../src/api/client";
import type {
  BacktestRequest,
  BacktestResult,
  RunList,
  RunSummary,
  StrategyMeta,
} from "../src/api/types";

const mockGetStrategies = jest.mocked(client.getStrategies);
const mockRunBacktest = jest.mocked(client.runBacktest);
const mockGetRun = jest.mocked(client.getRun);
const mockListRuns = jest.mocked(client.listRuns);
const mockDeleteRun = jest.mocked(client.deleteRun);

/** macd_cross 形态 meta(动态表单数据源,同 pages.test.tsx) */
const macdMeta: StrategyMeta = {
  type: "macd_cross",
  kind: "signal",
  signal: "macd",
  mode: "cross",
  defaults: { fast_period: 12, slow_period: 26, signal_period: 9, am_size: 100 },
  schema: {
    fast_period: { type: "integer", minimum: 1 },
    slow_period: { type: "integer", minimum: 1 },
    signal_period: { type: "integer", minimum: 1 },
    am_size: { type: "integer", minimum: 1 },
  },
};

/** 合法最小回测请求 */
const sampleRequest: BacktestRequest = {
  symbol: "AAPL",
  start: "2020-01-01",
  end: "2024-01-01",
  initial_capital: 100000,
  strategy: {
    type: "macd_cross",
    params: { fast_period: 12 },
    entry_pct: 100,
    entry_basis: "total",
  },
  benchmark_symbol: "^GSPC",
  cost: { commission_rate: 0.001, slippage: 0.01 },
  warmup_bars: 100,
};

/** 结果页详情 fixture */
const sampleResult: BacktestResult = {
  id: "run-1",
  request: sampleRequest,
  metrics: { total_return: 0.12, total_trade_count: 2, start_date: "2020-01-02" },
  curves: {
    dates: ["2020-01-02", "2020-01-03"],
    equity: [100000, 101000],
    position_value: [0, 50000],
    benchmark: [0, 1.2],
  },
  candles: {
    dates: ["2020-01-02", "2020-01-03"],
    open: [100, 101],
    high: [102, 103],
    low: [99, 100],
    close: [101, 102],
    volume: [10000, 12000],
    overlays: { ema_fast: [100.5, 101.2], ema_slow: [100.1, 100.8] },
    sub: { macd: { dif: [0.1, 0.2], dea: [0.05, 0.15], hist: [0.05, 0.05] } },
  },
  trades: [{ time: "2020-01-03", direction: "buy", price: 101, volume: 4950 }],
};

/** 历史列表条目 */
const runSummary: RunSummary = {
  id: "run-1",
  created_at: "2026-10-21T12:00:00",
  request: sampleRequest,
  metrics: { total_return: 0.12 },
};

describe("ConfigScreen(无路由依赖)", () => {
  it("渲染标题与表单,点历史回调 onOpenHistory", async () => {
    mockGetStrategies.mockResolvedValue([macdMeta]);
    const onOpenHistory = jest.fn();
    const screen = await render(
      <ConfigScreen onSubmit={jest.fn()} onOpenHistory={onOpenHistory} />,
    );
    await screen.findByText("开始回测");
    expect(screen.getByText("vn-demo 回测")).toBeTruthy();
    fireEvent.press(screen.getByText("历史记录"));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("渲染终端状态行 VND-DEMO(底线上下文)", async () => {
    mockGetStrategies.mockResolvedValue([macdMeta]);
    const screen = await render(
      <ConfigScreen onSubmit={jest.fn()} onOpenHistory={jest.fn()} />,
    );
    expect(await screen.findByText("VND-DEMO")).toBeTruthy();
  });

  it("加载失败仍呈现失败文案与状态行(回归保护)", async () => {
    mockGetStrategies.mockRejectedValue(new client.ApiError("bad", "INVALID_SYMBOL"));
    const screen = await render(
      <ConfigScreen onSubmit={jest.fn()} onOpenHistory={jest.fn()} />,
    );
    expect(await screen.findByText(/策略元数据加载失败:/)).toBeTruthy();
    expect(screen.getByText("VND-DEMO")).toBeTruthy();
  });

  it("提交成功回调 onSubmit(runId)", async () => {
    mockGetStrategies.mockResolvedValue([macdMeta]);
    mockRunBacktest.mockResolvedValue({ ...sampleResult, id: "run-9" });
    const onSubmit = jest.fn();
    const screen = await render(
      <ConfigScreen onSubmit={onSubmit} onOpenHistory={jest.fn()} />,
    );
    await screen.findByText("开始回测");
    await fireEvent.changeText(
      screen.getByPlaceholderText("标的代码,如 AAPL"),
      "AAPL",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("开始日期 YYYY-MM-DD"),
      "2020-01-01",
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("结束日期 YYYY-MM-DD"),
      "2024-01-01",
    );
    await fireEvent.press(screen.getByText("开始回测"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("run-9"));
  });
});

describe("ResultScreen(无路由依赖)", () => {
  it("渲染详情(标题/指标/图表区块/状态行上下文)", async () => {
    mockGetRun.mockResolvedValue(sampleResult);
    const screen = await render(<ResultScreen runId="run-1" onBack={jest.fn()} />);
    expect(await screen.findByText("AAPL · macd_cross")).toBeTruthy();
    expect(screen.getByText("总收益率")).toBeTruthy();
    expect(screen.getByText("MACD")).toBeTruthy();
    expect(screen.getByText("成交明细")).toBeTruthy();
    expect(screen.getByText("RUN run-1 · 1 TRADES")).toBeTruthy();
  });

  it("加载失败呈现失败态,返回回调 onBack", async () => {
    mockGetRun.mockRejectedValue(new client.ApiError("x", "RUN_NOT_FOUND"));
    const onBack = jest.fn();
    const screen = await render(<ResultScreen runId="run-404" onBack={onBack} />);
    await screen.findByText("回测结果加载失败");
    fireEvent.press(screen.getByText("返回"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("HistoryScreen(无路由依赖)", () => {
  it("列表行点击回调 onOpenRun,返回配置回调 onNavigateConfig,状态行计数", async () => {
    mockListRuns.mockResolvedValue({ items: [runSummary], total: 1 });
    const onOpenRun = jest.fn();
    const onNavigateConfig = jest.fn();
    const screen = await render(
      <HistoryScreen onOpenRun={onOpenRun} onNavigateConfig={onNavigateConfig} />,
    );
    await screen.findByText("AAPL");
    expect(screen.getByText("1 RUNS")).toBeTruthy();
    fireEvent.press(screen.getByText("返回配置"));
    expect(onNavigateConfig).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("AAPL"));
    expect(onOpenRun).toHaveBeenCalledWith("run-1");
  });
});
