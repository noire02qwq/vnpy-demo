/**
 * 策略动态表单测试:validateForm/buildRequest 纯函数为重点 + 组件 smoke。
 * 纯函数覆盖每条校验规则的正反分支;组件仅断言关键元素渲染与提交流程。
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import {
  StrategyForm,
  buildRequest,
  createInitialState,
  validateForm,
} from "../src/components/StrategyForm";
import type { FormState } from "../src/components/StrategyForm";
import type { BacktestRequest, StrategyMeta, StrategySpec } from "../src/api/types";

/** ema_cross(signal/cross 形态)schema 与注册表 defaults 对齐(不含 entry 字段) */
const emaCrossMeta: StrategyMeta = {
  type: "ema_cross",
  kind: "signal",
  signal: "ema",
  mode: "cross",
  defaults: { fast_period: 5, slow_period: 20, am_size: 100 },
  schema: {
    fast_period: { type: "integer", minimum: 1 },
    slow_period: { type: "integer", minimum: 1 },
    am_size: { type: "integer", minimum: 1 },
  },
};

/** ema_tpsl(tpsl 形态):含止盈止损,schema 额外携带 entry 字段(后端 defaults 同源) */
const emaTpslMeta: StrategyMeta = {
  type: "ema_tpsl",
  kind: "signal",
  signal: "ema",
  mode: "tpsl",
  defaults: {
    fast_period: 5,
    slow_period: 20,
    entry_pct: 100.0,
    entry_basis: "cash",
    take_profit_pct: 10.0,
    stop_loss_pct: 5.0,
    am_size: 30,
  },
  schema: {
    fast_period: { type: "integer", minimum: 1 },
    slow_period: { type: "integer", minimum: 1 },
    entry_pct: { type: "number" },
    entry_basis: { type: "string", enum: ["total", "cash"] },
    take_profit_pct: { type: "number" },
    stop_loss_pct: { type: "number" },
    am_size: { type: "integer", minimum: 1 },
  },
};

/** turtle(非 signal 形态):meta.signal === null */
const turtleMeta: StrategyMeta = {
  type: "turtle",
  kind: "turtle",
  signal: null,
  mode: "turtle",
  defaults: { entry_days: 20, exit_days: 10, risk_pct: 1.0 },
  schema: {
    entry_days: { type: "integer", minimum: 1 },
    exit_days: { type: "integer", minimum: 1 },
    risk_pct: { type: "number" },
  },
};

/** 合法最小 signal 形态表单状态(全部字段显式给出) */
function validState(overrides: Partial<FormState> = {}): FormState {
  return {
    symbol: "AAPL",
    start: "2020-01-01",
    end: "2024-01-01",
    initialCapital: "100000",
    strategyType: "ema_cross",
    params: { fast_period: "5", slow_period: "20", am_size: "100" },
    entryPct: "100",
    entryBasis: "total",
    benchmarkSymbol: "^GSPC",
    commissionRate: "0.001",
    slippage: "0.01",
    warmupBars: "100",
    ...overrides,
  };
}

describe("validateForm", () => {
  it("全合法 → null", () => {
    expect(validateForm(validState(), emaCrossMeta)).toBeNull();
  });

  it("symbol 为空 → 提示输入", () => {
    expect(validateForm(validState({ symbol: "" }), emaCrossMeta)).toBe(
      "请输入标的代码",
    );
  });

  it("symbol 小写 → 大写字母提示", () => {
    expect(validateForm(validState({ symbol: "aapl" }), emaCrossMeta)).toBe(
      "标的代码需为大写字母(如 AAPL、BRK-B)",
    );
  });

  it("symbol 含数字/后缀不符合任一形态 → 大写字母提示", () => {
    expect(validateForm(validState({ symbol: "AAPL1" }), emaCrossMeta)).toBe(
      "标的代码需为大写字母(如 AAPL、BRK-B)",
    );
  });

  it("start 格式非法 → 日期格式提示", () => {
    expect(
      validateForm(validState({ start: "2020/01/01" }), emaCrossMeta),
    ).toBe("日期需为合法的 YYYY-MM-DD");
  });

  it("end 为不存在的日历日(2024-02-30)→ 日期格式提示", () => {
    expect(validateForm(validState({ end: "2024-02-30" }), emaCrossMeta)).toBe(
      "日期需为合法的 YYYY-MM-DD",
    );
  });

  it("start === end → start 需早于 end", () => {
    expect(
      validateForm(validState({ start: "2024-01-01", end: "2024-01-01" }), emaCrossMeta),
    ).toBe("开始日期需早于结束日期");
  });

  it("start > end → start 需早于 end", () => {
    expect(
      validateForm(validState({ start: "2024-06-01", end: "2024-01-01" }), emaCrossMeta),
    ).toBe("开始日期需早于结束日期");
  });

  it("initialCapital 为 0 → 资金提示", () => {
    expect(validateForm(validState({ initialCapital: "0" }), emaCrossMeta)).toBe(
      "初始资金需大于 0",
    );
  });

  it("initialCapital 非数字 → 资金提示", () => {
    expect(validateForm(validState({ initialCapital: "abc" }), emaCrossMeta)).toBe(
      "初始资金需大于 0",
    );
  });

  it("signal 形态 entryPct=0 → 区间提示", () => {
    expect(validateForm(validState({ entryPct: "0" }), emaCrossMeta)).toBe(
      "仓位比例需在 (0,100] 区间",
    );
  });

  it("signal 形态 entryPct=101 → 区间提示", () => {
    expect(validateForm(validState({ entryPct: "101" }), emaCrossMeta)).toBe(
      "仓位比例需在 (0,100] 区间",
    );
  });

  it("signal 形态 entryPct 为空 → 默认 100 视为合法", () => {
    expect(validateForm(validState({ entryPct: "" }), emaCrossMeta)).toBeNull();
  });

  it("meta 未定义时跳过 signal 校验(entryPct=0 → null)", () => {
    expect(validateForm(validState({ entryPct: "0" }), undefined)).toBeNull();
  });

  it("tpsl 形态 take_profit_pct=-1 → 止盈提示", () => {
    const state = validState({
      strategyType: "ema_tpsl",
      params: {
        fast_period: "5",
        slow_period: "20",
        take_profit_pct: "-1",
        stop_loss_pct: "5",
        am_size: "30",
      },
    });
    expect(validateForm(state, emaTpslMeta)).toBe("止盈比例需大于 0");
  });

  it("tpsl 形态 stop_loss_pct 为空 → 止损提示", () => {
    const state = validState({
      strategyType: "ema_tpsl",
      params: {
        fast_period: "5",
        slow_period: "20",
        take_profit_pct: "10",
        stop_loss_pct: "",
        am_size: "30",
      },
    });
    expect(validateForm(state, emaTpslMeta)).toBe("止损比例需大于 0");
  });

  it("tpsl 形态止盈止损均 >0 → null", () => {
    const state = validState({
      strategyType: "ema_tpsl",
      entryBasis: "cash",
      params: {
        fast_period: "5",
        slow_period: "20",
        take_profit_pct: "10",
        stop_loss_pct: "5",
        am_size: "30",
      },
    });
    expect(validateForm(state, emaTpslMeta)).toBeNull();
  });

  it("非 tpsl 形态即使 params 带负的 take_profit_pct 也跳过规则 6 → null", () => {
    const state = validState({
      params: { fast_period: "5", slow_period: "20", am_size: "100", take_profit_pct: "-1" },
    });
    expect(validateForm(state, emaCrossMeta)).toBeNull();
  });
});

describe("buildRequest", () => {
  it("signal 形态:entry_pct/entry_basis 进 strategy,params 数字化", () => {
    const state = validState({ entryPct: "50", entryBasis: "cash" });
    const req = buildRequest(state, emaCrossMeta);
    expect(req.strategy).toEqual({
      type: "ema_cross",
      params: { fast_period: 5, slow_period: 20 },
      entry_pct: 50,
      entry_basis: "cash",
    });
    expect(req.symbol).toBe("AAPL");
    expect(req.initial_capital).toBe(100000);
    expect(req.cost).toEqual({ commission_rate: 0.001, slippage: 0.01 });
    expect(req.warmup_bars).toBe(100);
    expect(req.benchmark_symbol).toBe("^GSPC");
  });

  it("signal 形态 entryPct 为空 → 默认 100", () => {
    const req = buildRequest(validState({ entryPct: "" }), emaCrossMeta);
    expect(req.strategy.entry_pct).toBe(100);
  });

  it("turtle 形态:strategy 不携带 entry 字段", () => {
    const state = validState({
      strategyType: "turtle",
      params: { entry_days: "20", exit_days: "10", risk_pct: "1.0" },
    });
    const req = buildRequest(state, turtleMeta);
    expect(Object.prototype.hasOwnProperty.call(req.strategy, "entry_pct")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(req.strategy, "entry_basis")).toBe(false);
    expect(req.strategy.params).toEqual({ entry_days: 20, exit_days: 10, risk_pct: 1 });
  });

  it("tpsl 形态:entry 字段来自 state,不重复落入 params", () => {
    const state = validState({
      strategyType: "ema_tpsl",
      entryPct: "80",
      entryBasis: "cash",
      params: {
        fast_period: "5",
        slow_period: "20",
        take_profit_pct: "10",
        stop_loss_pct: "5",
        am_size: "30",
      },
    });
    const req = buildRequest(state, emaTpslMeta);
    expect(req.strategy.entry_pct).toBe(80);
    expect(req.strategy.entry_basis).toBe("cash");
    expect(req.strategy.params).toEqual({
      fast_period: 5,
      slow_period: 20,
      take_profit_pct: 10,
      stop_loss_pct: 5,
    });
  });

  it("am_size 由后端 _assemble_params 用 warmup 无条件覆盖:params 不含 am_size(即便 state 携带)", () => {
    const req = buildRequest(validState(), emaCrossMeta);
    expect(Object.prototype.hasOwnProperty.call(req.strategy.params ?? {}, "am_size")).toBe(
      false,
    );
    expect(req.strategy.params).toEqual({ fast_period: 5, slow_period: 20 });
  });

  it("boolean 参数保留布尔,未知 params 键被过滤", () => {
    const meta: StrategyMeta = {
      ...emaCrossMeta,
      defaults: { fast_period: 5, use_volume: false },
      schema: {
        fast_period: { type: "integer", minimum: 1 },
        use_volume: { type: "boolean" },
      },
    };
    const state = validState({
      params: { fast_period: "10", use_volume: true, rogue_key: "42" },
    });
    const req = buildRequest(state, meta);
    expect(req.strategy.params).toEqual({ fast_period: 10, use_volume: true });
  });

  it("benchmark 为空 → 默认 ^GSPC;warmup 为空 → 默认 100", () => {
    const req = buildRequest(
      validState({ benchmarkSymbol: "", warmupBars: "" }),
      emaCrossMeta,
    );
    expect(req.benchmark_symbol).toBe("^GSPC");
    expect(req.warmup_bars).toBe(100);
  });

  it("字符串参数原样透传(dca interval 不做数字强转)", () => {
    const dcaMeta: StrategyMeta = {
      type: "dca",
      kind: "dca",
      signal: null,
      mode: "dca",
      defaults: { interval: "monthly", amount: 1000.0, am_size: 10 },
      schema: {
        interval: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
        amount: { type: "number" },
        am_size: { type: "integer", minimum: 1 },
      },
    };
    const state = validState({
      strategyType: "dca",
      params: { interval: "monthly", amount: "1000", am_size: "10" },
    });
    const req = buildRequest(state, dcaMeta);
    expect(req.strategy.params).toEqual({
      interval: "monthly",
      amount: 1000,
    });
    expect(Object.prototype.hasOwnProperty.call(req.strategy.params ?? {}, "am_size")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(req.strategy, "entry_pct")).toBe(false);
  });
});

describe("validateForm 数字防线", () => {
  it("schema 数字参数填非数字 → 参数 {键名} 需为数字", () => {
    const state = validState({
      params: { fast_period: "abc", slow_period: "20", am_size: "100" },
    });
    expect(validateForm(state, emaCrossMeta)).toBe("参数 fast_period 需为数字");
  });

  it("warmup 非数字 → 暖机根数需为数字", () => {
    expect(validateForm(validState({ warmupBars: "abc" }), emaCrossMeta)).toBe(
      "暖机根数需为数字",
    );
  });

  it("佣金率/滑点非数字 → 对应中文报错", () => {
    expect(validateForm(validState({ commissionRate: "x" }), emaCrossMeta)).toBe(
      "佣金率需为数字",
    );
    expect(validateForm(validState({ slippage: "NaN" }), emaCrossMeta)).toBe(
      "滑点需为数字",
    );
  });
});

describe("StrategyForm 组件 smoke", () => {
  const onSubmit = jest.fn<void, [BacktestRequest]>();

  it("渲染标的代码输入、动态参数与提交按钮", async () => {
    const screen = await render(
      React.createElement(StrategyForm, { metas: [emaCrossMeta], onSubmit }),
    );
    expect(screen.getByPlaceholderText("标的代码,如 AAPL")).toBeTruthy();
    expect(screen.getByPlaceholderText("开始日期 YYYY-MM-DD")).toBeTruthy();
    expect(screen.getByText("ema_cross")).toBeTruthy();
    expect(screen.getByText("开始回测")).toBeTruthy();
  });

  it("metas 为空 → 显示加载策略元数据", async () => {
    const screen = await render(
      React.createElement(StrategyForm, { metas: [], onSubmit }),
    );
    expect(screen.getByText("加载策略元数据…")).toBeTruthy();
  });

  it("am_size 为后端 warmup 托管参数:不渲染控件(entry 字段亦不在参数区)", async () => {
    const screen = await render(
      React.createElement(StrategyForm, { metas: [emaCrossMeta], onSubmit }),
    );
    expect(screen.queryByText("am_size")).toBeNull();
    expect(screen.queryByText("entry_pct")).toBeNull();
    expect(screen.getByText("fast_period")).toBeTruthy();
    expect(screen.getByText("slow_period")).toBeTruthy();
  });

  it("非法提交:显示中文错误且不调 onSubmit", async () => {
    const screen = await render(
      React.createElement(StrategyForm, { metas: [emaCrossMeta], onSubmit }),
    );
    await fireEvent.press(screen.getByText("开始回测"));
    expect(screen.getByText("请输入标的代码")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("合法提交:调 onSubmit 并携带装配好的请求", async () => {
    const localOnSubmit = jest.fn<void, [BacktestRequest]>();
    const screen = await render(
      React.createElement(StrategyForm, { metas: [emaCrossMeta], onSubmit: localOnSubmit }),
    );
    await fireEvent.changeText(screen.getByPlaceholderText("标的代码,如 AAPL"), "AAPL");
    await fireEvent.changeText(screen.getByPlaceholderText("开始日期 YYYY-MM-DD"), "2020-01-01");
    await fireEvent.changeText(screen.getByPlaceholderText("结束日期 YYYY-MM-DD"), "2024-01-01");
    await fireEvent.press(screen.getByText("开始回测"));
    expect(localOnSubmit).toHaveBeenCalledTimes(1);
    const req = localOnSubmit.mock.calls[0][0];
    expect(req.symbol).toBe("AAPL");
    expect(req.strategy.type).toBe("ema_cross");
    expect(req.strategy.entry_pct).toBe(100);
  });
});

describe("createInitialState", () => {
  it("signal 形态:defaults 注入 params 与 entry 字段(entry 键不落 params)", () => {
    const state = createInitialState(emaTpslMeta);
    expect(state.strategyType).toBe("ema_tpsl");
    expect(state.params).toEqual({
      fast_period: "5",
      slow_period: "20",
      take_profit_pct: "10",
      stop_loss_pct: "5",
    });
    expect(state.entryPct).toBe("100");
    expect(state.entryBasis).toBe("cash");
  });

  it("meta 未定义 → 空策略与默认值", () => {
    const state = createInitialState(undefined);
    expect(state.strategyType).toBe("");
    expect(state.params).toEqual({});
    expect(state.benchmarkSymbol).toBe("^GSPC");
  });
});

describe("StrategySpec 类型契约(类型诚实化)", () => {
  // 断言即护栏:entry 字段可选后,非 signal 形态 spec 无需 as 断言即可构造(tsc 校验)
  it("entry 字段可选:非 signal 形态 spec 直接构造,entry_pct/entry_basis 为 undefined", () => {
    const spec: StrategySpec = { type: "turtle", params: { entry_days: 20 } };
    expect(spec.entry_pct).toBeUndefined();
    expect(spec.entry_basis).toBeUndefined();
    expect(spec.type).toBe("turtle");
  });
});


describe("金死叉 sell_pct 校验(镜像后端)", () => {
  const withSell = (v: string) =>
    validState({
      strategyType: "ema_cross",
      params: { ...emaCrossMeta.defaults, sell_pct: v },
    });

  it("sell_pct 150 → 报错", () => {
    expect(validateForm(withSell("150"), emaCrossMeta)).toBe(
      "卖出比例需在 (0,100] 区间",
    );
  });

  it("sell_pct 合法(50)→ 通过", () => {
    expect(validateForm(withSell("50"), emaCrossMeta)).toBeNull();
  });

  it("sell_pct 缺省(空)→ 通过(走后端默认 100)", () => {
    expect(validateForm(withSell(""), emaCrossMeta)).toBeNull();
  });
});
