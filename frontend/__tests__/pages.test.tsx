/**
 * 页面集成测试:配置页(app/index)/ 结果页(app/result/[id])/ 历史页(app/history)
 * + MetricCards 的 formatMetric / METRIC_LABELS 纯函数重点。
 * - 网络层:mock src/api/client(requireActual 保留真实 errorMessage/ApiError,只顶替网络函数);
 * - 路由层:mock expo-router(Link 以 children 直渲,router 记录调用);
 * - 图表层:mock react-native-webview(jest 下 LightChart 解析到 .native 实现);
 * - RNTL v14:render/fireEvent 返回 Promise,一律 await(F4 教训)。
 */
import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// mock 工厂自包含(jest.mock 会被提升到模块 const 声明之前,工厂内不可引用
// 外部变量,否则 TDZ ReferenceError);句柄在 import 之后经 jest.mocked 取回。
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

jest.mock("expo-router", () => {
  // 类型注解在编译期擦除,工厂无运行时越界引用(children 本就是已创建的元素)
  const Link = ({ children }: { children?: React.ReactNode }) => children ?? null;
  const router = { push: jest.fn<void, [string]>(), back: jest.fn<void, []>() };
  // 可变路由参数容器:结果页 id 变化重拉(F-M1)测试经 __routeParams 改写 id
  const routeParams = { id: "run-1" };
  return {
    Link,
    useRouter: () => router,
    useLocalSearchParams: () => routeParams,
    __routeParams: routeParams,
  };
});

import IndexPage from "../app/index";
import ResultPage from "../app/result/[id]";
import HistoryPage from "../app/history";
import { useRouter } from "expo-router";
import * as ExpoRouter from "expo-router";
import { formatMetric, METRIC_LABELS } from "../src/components/MetricCards";
import { MetricCards } from "../src/components/MetricCards";
import { ApiError } from "../src/api/client";
import * as client from "../src/api/client";
import type {
  BacktestRequest,
  BacktestResult,
  RunList,
  RunSummary,
  StrategyMeta,
} from "../src/api/types";

/** expo-router mock 暴露的可变参数容器(运行时 mock 才有的导出,类型侧手工标注) */
const routeParams = (ExpoRouter as unknown as {
  __routeParams: { id: string };
}).__routeParams;

/** 被测页面与断言共用的 mock 句柄(import 求值后取回,无 TDZ 问题) */
const mockPush = useRouter().push;
const mockGetStrategies = jest.mocked(client.getStrategies);
const mockRunBacktest = jest.mocked(client.runBacktest);
const mockGetRun = jest.mocked(client.getRun);
const mockListRuns = jest.mocked(client.listRuns);
const mockDeleteRun = jest.mocked(client.deleteRun);

/** macd_cross 形态 meta(配置页动态表单数据源) */
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

/** 合法最小回测请求(结果页/历史页条目共用) */
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

/** 结果页详情 fixture(macd 副图 + 单笔买入) */
const sampleResult: BacktestResult = {
  id: "run-1",
  request: sampleRequest,
  metrics: {
    total_return: 0.123456,
    annual_return: 0.03,
    max_drawdown: -0.05,
    sharpe_ratio: 1.234,
    total_trade_count: 12,
    start_date: "2020-01-02",
    information_ratio: null,
  },
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

/** 历史列表条目 fixture */
const runSummary: RunSummary = {
  id: "run-1",
  created_at: "2026-10-20T12:34:56",
  request: sampleRequest,
  metrics: { total_return: 0.25 },
};

let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

beforeEach(() => {
  jest.resetAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("formatMetric", () => {
  it("百分率键:×100 保留两位 + %", () => {
    expect(formatMetric("total_return", 0.123456)).toBe("12.35%");
    expect(formatMetric("annual_return", 0.03)).toBe("3.00%");
    expect(formatMetric("annual_volatility", 0.2)).toBe("20.00%");
  });

  it("最大回撤负数带符号(小数口径直接 ×100)", () => {
    expect(formatMetric("max_drawdown", -0.05)).toBe("-5.00%");
  });

  it("比率与其余数值:保留 3 位,负数带符号", () => {
    expect(formatMetric("sharpe_ratio", 1.234)).toBe("1.234");
    expect(formatMetric("beta", -0.5)).toBe("-0.500");
    expect(formatMetric("alpha_annual", 0.05)).toBe("0.050");
    expect(formatMetric("total_commission", 128.5)).toBe("128.500");
  });

  it("计数类键(total_trade_count/total_days):整数直接字符串化,不补小数位", () => {
    expect(formatMetric("total_trade_count", 12)).toBe("12");
    expect(formatMetric("total_days", 252)).toBe("252");
    expect(formatMetric("total_trade_count", 12.5)).toBe("12.500");
  });

  it("百分率口径不变:total_return 0.5 → 50.00%", () => {
    expect(formatMetric("total_return", 0.5)).toBe("50.00%");
  });

  it("null → —", () => {
    expect(formatMetric("information_ratio", null)).toBe("—");
  });

  it("字符串(日期)原样", () => {
    expect(formatMetric("start_date", "2024-01-02")).toBe("2024-01-02");
  });

  it("未收入标签表的键按通用数值规则处理", () => {
    expect(formatMetric("win_rate", 0.6)).toBe("0.600");
  });
});

describe("METRIC_LABELS", () => {
  it("契约 12 键中文映射且顺序固定", () => {
    expect(Object.keys(METRIC_LABELS)).toEqual([
      "total_return",
      "annual_return",
      "alpha_annual",
      "beta",
      "max_drawdown",
      "annual_volatility",
      "sharpe_ratio",
      "information_ratio",
      "total_trade_count",
      "total_commission",
      "return_drawdown_ratio",
      "total_days",
    ]);
    expect(METRIC_LABELS.total_return).toBe("总收益率");
    expect(METRIC_LABELS.max_drawdown).toBe("最大回撤");
    expect(METRIC_LABELS.total_days).toBe("回测天数");
  });
});

describe("MetricCards 组件", () => {
  it("横滚卡片:中文标签 + 格式化值,额外键以键名兜底", async () => {
    const screen = await render(
      React.createElement(MetricCards, {
        metrics: {
          total_return: 0.123456,
          information_ratio: null,
          start_date: "2024-01-02",
        },
      }),
    );
    expect(screen.getByText("总收益率")).toBeTruthy();
    expect(screen.getByText("12.35%")).toBeTruthy();
    expect(screen.getByText("信息比率")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("start_date")).toBeTruthy();
    expect(screen.getByText("2024-01-02")).toBeTruthy();
  });
});

describe("配置页(app/index)", () => {
  it("元数据到达前显示加载文案,到达后渲染表单与标题/历史链接", async () => {
    let resolveMeta!: (value: StrategyMeta[]) => void;
    mockGetStrategies.mockReturnValue(
      new Promise<StrategyMeta[]>((resolve) => {
        resolveMeta = resolve;
      }),
    );
    const screen = await render(React.createElement(IndexPage));
    expect(await screen.findByText("加载策略元数据…")).toBeTruthy();

    resolveMeta([macdMeta]);
    await screen.findByText("开始回测");
    expect(screen.queryByText("加载策略元数据…")).toBeNull();
    expect(screen.getByText("vn-demo 回测")).toBeTruthy();
    expect(screen.getByText("历史记录")).toBeTruthy();
    // am_size 由后端 warmup 托管:动态参数区不渲染该控件(F-I2)
    expect(screen.queryByText("am_size")).toBeNull();
    expect(screen.getByText("fast_period")).toBeTruthy();
  });

  it("元数据加载失败:Alert 中文文案 + 失败提示", async () => {
    mockGetStrategies.mockRejectedValue(new ApiError("bad", "INVALID_SYMBOL"));
    const screen = await render(React.createElement(IndexPage));
    expect(await screen.findByText("策略元数据加载失败")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith("错误", "无效标的代码");
  });

  it("提交成功:runBacktest 装配请求并跳转 /result/{id}", async () => {
    mockGetStrategies.mockResolvedValue([macdMeta]);
    mockRunBacktest.mockResolvedValue({ ...sampleResult, id: "run-9" });
    const screen = await render(React.createElement(IndexPage));
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
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/result/run-9"));
    expect(mockRunBacktest).toHaveBeenCalledTimes(1);
    expect(mockRunBacktest.mock.calls[0][0].symbol).toBe("AAPL");
    expect(mockRunBacktest.mock.calls[0][0].strategy.type).toBe("macd_cross");
  });

  it("提交失败:Alert 错误文案且不跳转", async () => {
    mockGetStrategies.mockResolvedValue([macdMeta]);
    mockRunBacktest.mockRejectedValue(new ApiError("rate", "RATE_LIMITED"));
    const screen = await render(React.createElement(IndexPage));
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
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("错误", "雅虎接口限流,请稍后重试"),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("结果页(app/result/[id])", () => {
  it("渲染标题、指标卡、K线/MACD 副图、三线图、成交行", async () => {
    mockGetRun.mockResolvedValue(sampleResult);
    const screen = await render(React.createElement(ResultPage));
    expect(await screen.findByText("AAPL · macd_cross")).toBeTruthy();
    expect(screen.getByText("总收益率")).toBeTruthy();
    expect(screen.getByText("12.35%")).toBeTruthy();
    expect(screen.getByText("-5.00%")).toBeTruthy();
    expect(screen.getByText("夏普比率")).toBeTruthy();
    expect(screen.getByText("1.234")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("2020-01-02")).toBeTruthy();
    expect(screen.getByText("K 线与均线")).toBeTruthy();
    expect(screen.getByText("MACD")).toBeTruthy();
    expect(screen.queryByText("KDJ")).toBeNull();
    expect(screen.getByText("策略 vs S&P500")).toBeTruthy();
    expect(screen.getByText("成交明细")).toBeTruthy();
    expect(screen.getByText("2020-01-03")).toBeTruthy();
    expect(screen.getByText("买")).toBeTruthy();
    expect(screen.getByText("101")).toBeTruthy();
    expect(screen.getByText("4950")).toBeTruthy();
  });

  it("kdj 副图按存在性渲染", async () => {
    mockGetRun.mockResolvedValue({
      ...sampleResult,
      candles: {
        ...sampleResult.candles,
        sub: {
          kdj: { k: [1, 2], d: [0.5, 1], j: [2, 4] },
        },
      },
    });
    const screen = await render(React.createElement(ResultPage));
    expect(await screen.findByText("KDJ")).toBeTruthy();
    expect(screen.queryByText("MACD")).toBeNull();
  });

  it("加载中显示加载文案", async () => {
    mockGetRun.mockReturnValue(new Promise<BacktestResult>(() => {}));
    const screen = await render(React.createElement(ResultPage));
    expect(await screen.findByText("加载回测结果…")).toBeTruthy();
  });

  it("加载失败:Alert 中文文案 + 返回按钮", async () => {
    mockGetRun.mockRejectedValue(new ApiError("missing", "RUN_NOT_FOUND"));
    const screen = await render(React.createElement(ResultPage));
    expect(await screen.findByText("返回")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith("错误", "回测记录不存在");
    expect(screen.queryByText("K 线与均线")).toBeNull();
  });

  it("id 变化重拉:失败态先重置,新请求成功后恢复内容渲染(F-M1)", async () => {
    mockGetRun.mockRejectedValueOnce(new ApiError("missing", "RUN_NOT_FOUND"));
    const screen = await render(React.createElement(ResultPage));
    expect(await screen.findByText("回测结果加载失败")).toBeTruthy();

    routeParams.id = "run-2";
    mockGetRun.mockResolvedValue({ ...sampleResult, id: "run-2" });
    await screen.rerender(React.createElement(ResultPage));
    expect(await screen.findByText("AAPL · macd_cross")).toBeTruthy();
    expect(screen.queryByText("回测结果加载失败")).toBeNull();

    routeParams.id = "run-1"; // 还原,免影响后续用例
  });
});

describe("历史页(app/history)", () => {
  it("渲染列表行:标的/形态/日期(前 10 位)/总收益率", async () => {
    mockListRuns.mockResolvedValue({ items: [runSummary], total: 1 });
    const screen = await render(React.createElement(HistoryPage));
    expect(await screen.findByText("AAPL")).toBeTruthy();
    expect(screen.getByText("macd_cross")).toBeTruthy();
    expect(screen.getByText("2026-10-20")).toBeTruthy();
    expect(screen.getByText("25.00%")).toBeTruthy();
    expect(screen.getByText("删除")).toBeTruthy();
    expect(screen.getByText("返回配置")).toBeTruthy();
  });

  it("点击行跳转结果页", async () => {
    mockListRuns.mockResolvedValue({ items: [runSummary], total: 1 });
    const screen = await render(React.createElement(HistoryPage));
    await fireEvent.press(await screen.findByText("AAPL"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/result/run-1"));
  });

  it("删除后刷新列表(删空 → 空态文案)", async () => {
    mockListRuns
      .mockResolvedValueOnce({ items: [runSummary], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    mockDeleteRun.mockResolvedValue(undefined);
    const screen = await render(React.createElement(HistoryPage));
    await screen.findByText("AAPL");
    await fireEvent.press(screen.getByText("删除"));
    expect(mockDeleteRun).toHaveBeenCalledWith("run-1");
    expect(await screen.findByText("暂无回测记录")).toBeTruthy();
    await waitFor(() => expect(mockListRuns).toHaveBeenCalledTimes(2));
  });

  it("空列表 → 空态文案", async () => {
    mockListRuns.mockResolvedValue({ items: [], total: 0 });
    const screen = await render(React.createElement(HistoryPage));
    expect(await screen.findByText("暂无回测记录")).toBeTruthy();
    expect(screen.getByText("返回配置")).toBeTruthy();
  });
});
