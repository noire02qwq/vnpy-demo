/**
 * REST 客户端:统一 fetch 包装(解析 JSON / 非 2xx 抛 ApiError / 204 跳过解析)。
 * 契约见 spec §8;类型定义在同目录 types.ts。
 */
import type {
  BacktestRequest,
  BacktestResult,
  FetchSummary,
  RunList,
  StrategyMeta,
} from "./types";

/** API 基地址:Expo 公共环境变量可覆盖,缺省本机后端 */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";

/** 非 2xx 错误:code/message 来自响应体的 {code,message}(解析失败则双缺省) */
export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/** 错误码 → 中文文案(与后端 errors.py ErrorCode 一一对应) */
const ERROR_TEXT: Record<string, string> = {
  INVALID_SYMBOL: "无效标的代码",
  NO_DATA: "区间内无数据",
  RANGE_TOO_SHORT: "区间过短,暖机不足",
  RATE_LIMITED: "雅虎接口限流,请稍后重试",
  BAD_PARAMS: "参数错误",
  RUN_NOT_FOUND: "回测记录不存在",
  INTERNAL: "服务器内部错误",
  NETWORK_ERROR: "无法连接后端服务",
};

const FALLBACK_TEXT = "请求失败";

/** 错误码 → 中文;未知码回退 fallback ?? "请求失败" */
export function errorMessage(code: string | undefined, fallback?: string): string {
  if (code !== undefined) {
    const text = ERROR_TEXT[code];
    if (text !== undefined) {
      return text;
    }
  }
  return fallback ?? FALLBACK_TEXT;
}

/** 统一请求:默认 JSON 头(与调用方传入的 headers 合并,不被整体覆盖);非 2xx 解析 {code,message} 抛 ApiError;204 不解析 body;网络层失败抛 NETWORK_ERROR */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // fetch 仅在网络层失败时 reject(后端未启动/代理劫持/跨源被拦)
    throw new ApiError(
      `无法连接后端(${API_BASE}),请确认后端已启动且未被代理拦截`,
      "NETWORK_ERROR",
    );
  }

  if (!res.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = (await res.json()) as { code?: string; message?: string };
    } catch {
      // 非 JSON 错误体(网关/代理页常见)→ 走兜底文案
    }
    throw new ApiError(body.message ?? errorMessage(body.code), body.code);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return (await res.json()) as T;
}

/** 策略形态目录(动态表单数据源) */
export function getStrategies(): Promise<StrategyMeta[]> {
  return request<{ strategies: StrategyMeta[] }>("/api/v1/meta/strategies").then(
    (body) => body.strategies,
  );
}

/** 预取数据并回摘要(校验标的可拉) */
export function fetchData(symbol: string, start: string, end: string): Promise<FetchSummary> {
  return request<FetchSummary>("/api/v1/data/fetch", {
    method: "POST",
    body: JSON.stringify({ symbol, start, end }),
  });
}

/** 执行回测(同步,响应含 id) */
export function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  return request<BacktestResult>("/api/v1/backtests", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** 历史列表(分页) */
export function listRuns(page: number, pageSize: number): Promise<RunList> {
  return request<RunList>(`/api/v1/backtests?page=${page}&page_size=${pageSize}`);
}

/** 单条历史详情 */
export function getRun(id: string): Promise<BacktestResult> {
  return request<BacktestResult>(`/api/v1/backtests/${id}`);
}

/** 删除历史记录(204 无响应体) */
export function deleteRun(id: string): Promise<void> {
  return request<void>(`/api/v1/backtests/${id}`, { method: "DELETE" });
}
