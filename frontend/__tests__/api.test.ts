import {
  ApiError,
  deleteRun,
  errorMessage,
  fetchData,
  getRun,
  getStrategies,
  listRuns,
  runBacktest,
} from "../src/api/client";
import type { BacktestRequest, BacktestResult, StrategyMeta } from "../src/api/types";

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

const sampleRequest: BacktestRequest = {
  symbol: "600519.SS",
  start: "2024-01-01",
  end: "2024-12-31",
  initial_capital: 1_000_000,
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

const sampleResult: BacktestResult = {
  id: "run-1",
  request: sampleRequest,
  metrics: { total_return: 0.12, max_drawdown: 0.05 },
  curves: {
    dates: ["2024-01-02", "2024-01-03"],
    equity: [1_000_000, 1_010_000],
    position_value: [0, 500_000],
    benchmark: [0, 1.5],
  },
  candles: {
    dates: ["2024-01-02", "2024-01-03"],
    open: [100, 101],
    high: [102, 103],
    low: [99, 100],
    close: [101, 102],
    volume: [10_000, 12_000],
    overlays: { ema_fast: [100.5, 101.2], ema_slow: [100.1, 100.8] },
    sub: { macd: { dif: [0.1, 0.2], dea: [0.05, 0.15], hist: [0.05, 0.05] } },
  },
  trades: [
    { time: "2024-01-03", direction: "buy", price: 101, volume: 4950 },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("runBacktest", () => {
  it("以 POST + JSON body 请求 /api/v1/backtests 并返回解析结果", async () => {
    fetchMock.mockResolvedValue(jsonResponse(sampleResult));

    const result = await runBacktest(sampleRequest);

    expect(result).toEqual(sampleResult);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/backtests");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual(sampleRequest);
  });

  it("非 2xx 抛 ApiError,code 与 message 来自响应", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: "RATE_LIMITED", message: "雅虎接口限流,请稍后重试", detail: null },
        429,
      ),
    );

    const err = await runBacktest(sampleRequest).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("RATE_LIMITED");
    expect((err as ApiError).message).toBe("雅虎接口限流,请稍后重试");
  });

  it("非 2xx 且响应体非 JSON 时回退兜底文案,code 为 undefined", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    const err = await runBacktest(sampleRequest).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBeUndefined();
    expect((err as ApiError).message).toBe("请求失败");
  });
});

describe("errorMessage", () => {
  it.each([
    ["INVALID_SYMBOL", "无效标的代码"],
    ["NO_DATA", "区间内无数据"],
    ["RANGE_TOO_SHORT", "区间过短,暖机不足"],
    ["RATE_LIMITED", "雅虎接口限流,请稍后重试"],
    ["BAD_PARAMS", "参数错误"],
    ["RUN_NOT_FOUND", "回测记录不存在"],
    ["INTERNAL", "服务器内部错误"],
  ])("映射错误码 %s → %s", (code, text) => {
    expect(errorMessage(code)).toBe(text);
  });

  it("未知码回退 fallback ?? 请求失败", () => {
    expect(errorMessage("SOMETHING_ELSE")).toBe("请求失败");
    expect(errorMessage("SOMETHING_ELSE", "自定义兜底")).toBe("自定义兜底");
    expect(errorMessage(undefined)).toBe("请求失败");
    expect(errorMessage(undefined, "网络异常")).toBe("网络异常");
  });
});

describe("deleteRun", () => {
  it("DELETE /api/v1/backtests/{id} 对 204 不解析 body", async () => {
    const json = jest.fn();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);

    await expect(deleteRun("run-1")).resolves.toBeUndefined();

    expect(json).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/backtests/run-1");
    expect(init.method).toBe("DELETE");
  });
});

describe("getStrategies", () => {
  it("GET /api/v1/meta/strategies 并解包 {strategies}", async () => {
    const strategies: StrategyMeta[] = [
      {
        type: "macd_cross",
        kind: "signal",
        signal: "macd",
        mode: "long",
        defaults: { fast_period: 12, use_tp: false },
        schema: {
          fast_period: { type: "integer", minimum: 1 },
          use_tp: { type: "boolean" },
        },
      },
      {
        type: "dca",
        kind: "position",
        signal: null,
        mode: "long",
        defaults: { interval: "monthly" },
        schema: { interval: { type: "string", enum: ["weekly", "monthly"] } },
      },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ strategies }));

    await expect(getStrategies()).resolves.toEqual(strategies);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:8000/api/v1/meta/strategies",
    );
  });
});

describe("fetchData", () => {
  it("POST /api/v1/data/fetch,body 为 {symbol,start,end}", async () => {
    const summary = {
      symbol: "600519.SS",
      rows: 240,
      first_date: "2024-01-02",
      last_date: "2024-12-31",
      cache_hit: false,
    };
    fetchMock.mockResolvedValue(jsonResponse(summary));

    await expect(fetchData("600519.SS", "2024-01-01", "2024-12-31")).resolves.toEqual(
      summary,
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/data/fetch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      symbol: "600519.SS",
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });
});

describe("listRuns", () => {
  it("GET /api/v1/backtests 携带 page/page_size 查询参数", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0 }));

    await expect(listRuns(2, 5)).resolves.toEqual({ items: [], total: 0 });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:8000/api/v1/backtests?page=2&page_size=5",
    );
  });
});

describe("getRun", () => {
  it("GET /api/v1/backtests/{id}", async () => {
    fetchMock.mockResolvedValue(jsonResponse(sampleResult));

    await expect(getRun("run-1")).resolves.toEqual(sampleResult);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:8000/api/v1/backtests/run-1",
    );
  });
});
