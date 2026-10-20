/**
 * API 契约类型(spec §8,与 backend/app/api/schemas.py、engine/service.py 对齐)。
 * 手写镜像:后端 openapi 导出在 src/api/schema.json,结构变化时以它为准同步。
 */

/** 策略形态 8 值联合(后端 STRATEGY_REGISTRY 键集) */
export type StrategyType =
  | "macd_cross"
  | "kdj_cross"
  | "ema_cross"
  | "macd_tpsl"
  | "kdj_tpsl"
  | "ema_tpsl"
  | "turtle"
  | "dca";

/** 信号副图类型(turtle/dca 为 null) */
export type SignalKind = "macd" | "kdj" | "ema";

/** 建仓资金基准 */
export type EntryBasis = "total" | "cash";

/** 策略参数标量值(meta defaults 与 strategy.params 共用) */
export type StrategyParamValue = number | boolean | string;

/** meta 端点输出的简易参数 JSON Schema 片段 */
export interface ParamSchema {
  type: "number" | "integer" | "boolean" | "string";
  enum?: string[];
  minimum?: number;
}

/** GET /api/v1/meta/strategies 条目:动态表单所需的形态元数据 */
export interface StrategyMeta {
  type: StrategyType;
  kind: string;
  signal: SignalKind | null;
  mode: string;
  defaults: Record<string, StrategyParamValue>;
  schema: Record<string, ParamSchema>;
}

/** POST /api/v1/backtests 请求体(与后端 BacktestRequest 一致) */
export interface StrategySpec {
  type: StrategyType;
  params?: Record<string, StrategyParamValue>;
  entry_pct: number;
  entry_basis: EntryBasis;
}

/** 手续费/滑点配置(后端 CostConfig,extra=forbid,无 commission_fixed) */
export interface CostConfig {
  commission_rate: number;
  slippage: number;
}

export interface BacktestRequest {
  symbol: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  initial_capital: number;
  strategy: StrategySpec;
  benchmark_symbol: string;
  cost: CostConfig;
  warmup_bars: number;
}

/** 单笔成交(后端 trades 装配字段) */
export interface Trade {
  /** YYYY-MM-DD */
  time: string;
  direction: "buy" | "sell";
  price: number;
  volume: number;
}

/** 三条主曲线(与 dates 等长;benchmark 为首值 0.0 的累计收益率 %) */
export interface Curves {
  dates: string[];
  equity: number[];
  position_value: number[];
  benchmark: number[];
}

/** K 线叠加:ema 形态出双线,其余为空对象/缺省 */
export interface CandleOverlays {
  ema_fast?: number[];
  ema_slow?: number[];
}

export interface MacdSeries {
  dif: number[];
  dea: number[];
  hist: number[];
}

export interface KdjSeries {
  k: number[];
  d: number[];
  j: number[];
}

/** K 线 + 信号副图:macd/kdj 出对应键,turtle/dca 双空 */
export interface Candles {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  overlays?: CandleOverlays;
  sub?: { macd?: MacdSeries; kdj?: KdjSeries };
}

/** 回测结果:POST 响应与 GET /api/v1/backtests/{id}(无 stats_raw/created_at) */
export interface BacktestResult {
  id: string;
  request: BacktestRequest;
  metrics: Record<string, number>;
  curves: Curves;
  candles: Candles;
  trades: Trade[];
}

/** GET /api/v1/backtests 列表条目 */
export interface RunSummary {
  id: string;
  created_at: string;
  request: BacktestRequest;
  metrics: Record<string, number>;
}

export interface RunList {
  items: RunSummary[];
  total: number;
}

/** POST /api/v1/data/fetch 摘要 */
export interface FetchSummary {
  symbol: string;
  rows: number;
  first_date: string;
  last_date: string;
  cache_hit: boolean;
}

/** 后端统一错误码(errors.py ErrorCode) */
export type ErrorCode =
  | "INVALID_SYMBOL"
  | "NO_DATA"
  | "RANGE_TOO_SHORT"
  | "RATE_LIMITED"
  | "BAD_PARAMS"
  | "RUN_NOT_FOUND"
  | "INTERNAL";

/** 统一错误响应体 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  detail: unknown;
}
