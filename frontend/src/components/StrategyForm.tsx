/**
 * 策略动态表单:meta schema 驱动的参数输入与回测请求装配。
 * - 校验(validateForm)与请求装配(buildRequest)抽为导出纯函数,是测试重点;
 * - schema 驱动控件:enum → Segmented(2-3 选项;web 桥接原生 <select>)、
 *   boolean → Switch、number/integer → Input(mono 数字);
 * - 视觉:琥珀行情终端 token(className,uniwind);逻辑与样式层解耦;
 * - entry_pct/entry_basis 仅 signal 形态显示;am_size 由后端 warmup 托管,三处
 *   (参数控件/初始 params/请求 params)统一排除;benchmark/cost/warmup 折叠进高级设置卡片。
 */
import { useState } from "react";
import { Platform, Switch, Text, View } from "react-native";
import type { FC, ReactNode } from "react";
import type {
  BacktestRequest,
  EntryBasis,
  StrategyMeta,
  StrategyParamValue,
  StrategySpec,
  StrategyType,
} from "../api/types";
import { Btn } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Segmented } from "../ui/Segmented";
import { Card } from "../ui/Card";
import { UIText } from "../ui/Text";

/** 表单状态:数字输入以 string 暂存(空串=未填),提交时经 buildRequest 转换 */
export interface FormState {
  symbol: string;
  start: string;
  end: string;
  initialCapital: string;
  strategyType: string;
  params: Record<string, string | boolean>;
  entryPct: string;
  entryBasis: "total" | "cash";
  benchmarkSymbol: string;
  commissionRate: string;
  slippage: string;
  warmupBars: string;
}

/** benchmark 缺省(与后端 BacktestRequest.benchmark_symbol 默认一致) */
const DEFAULT_BENCHMARK = "^GSPC";
/** entry_pct 缺省(strategy.entry_pct 后端默认 100) */
const DEFAULT_ENTRY_PCT = "100";

/**
 * 不进参数控件区/params 请求体的 schema 键:
 * - entry_pct/entry_basis:提升为 strategy 级字段(signal 形态单独输入);
 * - am_size:后端 _assemble_params 无条件用 warmup_bars 覆盖,UI 双输入误导,整体不带上。
 */
const NON_PARAM_KEYS: ReadonlySet<string> = new Set([
  "entry_pct",
  "entry_basis",
  "am_size",
]);

/** 标的代码:普通 1-5 大写字母(可带 -X 后缀)或 ^ 引导的指数 3-5 大写字母 */
const SYMBOL_RE = /^[A-Z]{1,5}(-[A-Z])?$|^\^[A-Z]{3,5}$/;
/** YYYY-MM-DD 字面格式 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → 可解析且日历真实存在(拒绝 2024-02-30 这类 Date 静默进位值) */
function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/** 数字输入(空串按缺省处理)→ 有限数 */
function toNumber(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return fallback;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

/** 输入可解析为有限数字(空串放行,由各字段缺省逻辑兜底) */
function isFiniteNumber(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed === "" || Number.isFinite(Number(trimmed));
}

/**
 * 提交前校验(镜像后端 BacktestRequest/StrategySpec 规则,顺序即报错优先级)。
 * 返回首个中文错误文案;全合法 → null。
 */
export function validateForm(
  state: FormState,
  meta: StrategyMeta | undefined,
): string | null {
  if (state.symbol.trim() === "") {
    return "请输入标的代码";
  }
  if (!SYMBOL_RE.test(state.symbol.trim())) {
    return "标的代码需为大写字母(如 AAPL、BRK-B)";
  }
  if (!isValidDate(state.start) || !isValidDate(state.end)) {
    return "日期需为合法的 YYYY-MM-DD";
  }
  // ISO 格式字典序即时间序,字符串比较足够
  if (state.start >= state.end) {
    return "开始日期需早于结束日期";
  }
  if (!(toNumber(state.initialCapital, NaN) > 0)) {
    return "初始资金需大于 0";
  }
  const isSignal = meta !== undefined && meta.signal !== null;
  if (isSignal) {
    const entryPct = toNumber(state.entryPct, 100);
    if (!(entryPct > 0 && entryPct <= 100)) {
      return "仓位比例需在 (0,100] 区间";
    }
  }
  if (state.strategyType.endsWith("_tpsl")) {
    const takeProfit = toNumber(String(state.params.take_profit_pct ?? ""), NaN);
    if (!(takeProfit > 0)) {
      return "止盈比例需大于 0";
    }
    const stopLoss = toNumber(String(state.params.stop_loss_pct ?? ""), NaN);
    if (!(stopLoss > 0)) {
      return "止损比例需大于 0";
    }
  }
  // 金死叉形态:卖出比例 sell_pct ∈ (0,100](镜像后端 CROSS_TYPES 校验)
  if (meta !== undefined && meta.mode === "cross") {
    const rawSell = state.params.sell_pct;
    if (rawSell !== undefined && String(rawSell).trim() !== "") {
      const sellPct = toNumber(String(rawSell), NaN);
      if (!(sellPct > 0 && sellPct <= 100)) {
        return "卖出比例需在 (0,100] 区间";
      }
    }
  }
  // 数字防线:schema 数字参数(Number("") === 0,须先排除空串)与暖机/成本项须为有限数字
  if (meta) {
    for (const key of Object.keys(meta.schema)) {
      const schemaType = meta.schema[key].type;
      if (schemaType !== "number" && schemaType !== "integer") {
        continue;
      }
      const raw = state.params[key];
      if (raw === undefined) {
        continue;
      }
      const text = String(raw).trim();
      if (text === "" || !Number.isFinite(Number(text))) {
        return `参数 ${key} 需为数字`;
      }
    }
  }
  if (!isFiniteNumber(state.warmupBars)) {
    return "暖机根数需为数字";
  }
  if (!isFiniteNumber(state.commissionRate)) {
    return "佣金率需为数字";
  }
  if (!isFiniteNumber(state.slippage)) {
    return "滑点需为数字";
  }
  return null;
}

/** 请求装配:params 数字键 Number()、boolean 键保留;entry/am_size 等托管键排除(NON_PARAM_KEYS) */
export function buildRequest(
  state: FormState,
  meta: StrategyMeta | undefined,
): BacktestRequest {
  const type: StrategyType = meta ? meta.type : (state.strategyType as StrategyType);

  const params: Record<string, StrategyParamValue> = {};
  if (meta) {
    for (const key of Object.keys(meta.schema)) {
      // entry 字段提升为 strategy 级、am_size 由后端 warmup 覆盖:均不落 params
      if (NON_PARAM_KEYS.has(key)) {
        continue;
      }
      const raw = state.params[key];
      if (raw === undefined) {
        continue;
      }
      // 按 schema 类型分支:数字才转换,字符串(interval 等 enum 值)原样透传
      const schemaType = meta.schema[key].type;
      if (schemaType === "boolean") {
        params[key] = Boolean(raw);
      } else if (schemaType === "string") {
        params[key] = String(raw);
      } else {
        params[key] = Number(String(raw).trim());
      }
    }
  }

  // signal 形态传 entry 字段;turtle/dca 省略(后端 StrategySpec 默认 100.0/"total";
  // entry 字段类型可选,非 signal 分支无需断言直接构造)
  const isSignal = meta !== undefined && meta.signal !== null;
  const spec: StrategySpec = isSignal
    ? {
        type,
        params,
        entry_pct: toNumber(state.entryPct, 100),
        entry_basis: state.entryBasis,
      }
    : { type, params };

  return {
    symbol: state.symbol.trim(),
    start: state.start,
    end: state.end,
    initial_capital: Number(state.initialCapital.trim()),
    strategy: spec,
    benchmark_symbol: state.benchmarkSymbol.trim() || DEFAULT_BENCHMARK,
    cost: {
      commission_rate: Number(state.commissionRate.trim()),
      slippage: Number(state.slippage.trim()),
    },
    warmup_bars: toNumber(state.warmupBars, 100),
  };
}

/** 由 meta defaults 生成初始表单状态(defaults 数值 → string;entry/am_size 托管键不入 state) */
export function createInitialState(meta: StrategyMeta | undefined): FormState {
  const params: Record<string, string | boolean> = {};
  const isSignal = meta !== undefined && meta.signal !== null;
  if (meta) {
    for (const [key, value] of Object.entries(meta.defaults)) {
      if (NON_PARAM_KEYS.has(key)) {
        continue;
      }
      params[key] = typeof value === "boolean" ? value : String(value);
    }
  }
  return {
    symbol: "",
    start: "",
    end: "",
    initialCapital: "100000",
    strategyType: meta ? meta.type : "",
    params,
    entryPct:
      isSignal && meta && typeof meta.defaults.entry_pct === "number"
        ? String(meta.defaults.entry_pct)
        : DEFAULT_ENTRY_PCT,
    entryBasis:
      isSignal && meta && meta.defaults.entry_basis === "cash" ? "cash" : "total",
    benchmarkSymbol: DEFAULT_BENCHMARK,
    commissionRate: "0.001",
    slippage: "0.01",
    warmupBars: "100",
  };
}

/* ---------- web 平台 <select>/<option> 桥接 ---------- */

interface WebSelectProps {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  style?: Record<string, string | number>;
  children?: ReactNode;
}

// RN 类型体系没有 DOM 内建元素,经 FC 断言桥接真实 <select>/<option>(仅 web 分支渲染)
const WebSelect = "select" as unknown as FC<WebSelectProps>;
const WebOption = "option" as unknown as FC<{ value: string; children: string }>;

/** web 端 select 的琥珀终端配色(DOM 原生样式,非 className) */
const WEB_SELECT_STYLE = {
  padding: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#2C251B",
  borderRadius: 6,
  backgroundColor: "#14110D",
  color: "#EDE4D3",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
} as const;

/** 枚举选择器:web 用原生 select,native 用 Segmented(选中态 accent) */
function EnumSelect({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}) {
  if (Platform.OS === "web") {
    return (
      <WebSelect
        value={value}
        onChange={(event) => onSelect(event.target.value)}
        style={WEB_SELECT_STYLE}
      >
        {options.map((option) => (
          <WebOption key={option} value={option}>
            {option}
          </WebOption>
        ))}
      </WebSelect>
    );
  }
  return (
    <Segmented
      value={value}
      options={options.map((option) => ({ value: option, label: option }))}
      onChange={onSelect}
    />
  );
}

/** 字段组:标签 + 控件 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mb-2.5">
      <Label>{label}</Label>
      {children}
    </View>
  );
}

export function StrategyForm({
  metas,
  onSubmit,
  submitting = false,
}: {
  metas: StrategyMeta[];
  onSubmit: (req: BacktestRequest) => void;
  submitting?: boolean;
}) {
  const [state, setState] = useState<FormState>(() => createInitialState(metas[0]));
  const [error, setError] = useState<string | null>(null);

  if (metas.length === 0) {
    return (
      <View>
        <UIText variant="muted">加载策略元数据…</UIText>
      </View>
    );
  }

  // strategyType 缺失(异步 metas 后到)时回退首项,渲染值再按 defaults 自愈
  const meta =
    metas.find((item) => item.type === state.strategyType) ?? metas[0];
  const isSignal = meta.signal !== null;
  // entry 字段单独渲染、am_size 后端托管:参数控件区一律排除(NON_PARAM_KEYS)
  const paramKeys = Object.keys(meta.schema).filter(
    (key) => !NON_PARAM_KEYS.has(key),
  );

  const patch = (part: Partial<FormState>) =>
    setState((prev) => ({ ...prev, ...part }));
  const patchParam = (key: string, value: string | boolean) =>
    setState((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));

  /** 切形态:重置 params/entry 字段,保留用户已填的市场与成本设置 */
  const selectType = (type: string) => {
    const next = createInitialState(metas.find((item) => item.type === type));
    setState((prev) => ({
      ...next,
      symbol: prev.symbol,
      start: prev.start,
      end: prev.end,
      initialCapital: prev.initialCapital,
      benchmarkSymbol: prev.benchmarkSymbol,
      commissionRate: prev.commissionRate,
      slippage: prev.slippage,
      warmupBars: prev.warmupBars,
    }));
  };

  const handleSubmit = () => {
    const problem = validateForm(state, meta);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    onSubmit(buildRequest(state, meta));
  };

  return (
    <View>
      <Field label="策略">
        <EnumSelect
          value={meta.type}
          options={metas.map((item) => item.type)}
          onSelect={selectType}
        />
      </Field>

      <Field label="标的代码">
        <Input
          placeholder="标的代码,如 AAPL"
          value={state.symbol}
          onChange={(symbol) => patch({ symbol: symbol.toUpperCase() })}
        />
      </Field>

      <View className="flex-row flex-wrap gap-2">
        <View className="flex-1 min-w-[140px]">
          <Field label="开始日期">
            <Input
              placeholder="开始日期 YYYY-MM-DD"
              value={state.start}
              onChange={(start) => patch({ start })}
              numeric
            />
          </Field>
        </View>
        <View className="flex-1 min-w-[140px]">
          <Field label="结束日期">
            <Input
              placeholder="结束日期 YYYY-MM-DD"
              value={state.end}
              onChange={(end) => patch({ end })}
              numeric
            />
          </Field>
        </View>
      </View>

      <Field label="初始资金">
        <Input
          placeholder="100000"
          numeric
          value={state.initialCapital}
          onChange={(initialCapital) => patch({ initialCapital })}
        />
      </Field>

      {paramKeys.map((key) => {
        const schema = meta.schema[key];
        const raw = state.params[key];
        return (
          <Field key={key} label={key}>
            {schema.enum !== undefined ? (
              <EnumSelect
                value={typeof raw === "string" ? raw : String(schema.enum[0])}
                options={schema.enum}
                onSelect={(value) => patchParam(key, value)}
              />
            ) : schema.type === "boolean" ? (
              <Switch
                value={raw === true}
                onValueChange={(value) => patchParam(key, value)}
              />
            ) : (
              <Input
                numeric
                value={typeof raw === "string" ? raw : ""}
                onChange={(value) => patchParam(key, value)}
              />
            )}
          </Field>
        );
      })}

      {isSignal && (
        <View className="flex-row flex-wrap gap-2">
          <View className="flex-1 min-w-[140px]">
            <Field label="仓位比例(%)">
              <Input
                numeric
                placeholder={DEFAULT_ENTRY_PCT}
                value={state.entryPct}
                onChange={(entryPct) => patch({ entryPct })}
              />
            </Field>
          </View>
          <View className="flex-1 min-w-[140px]">
            <Field label="建仓基准">
              <EnumSelect
                value={state.entryBasis}
                options={["total", "cash"]}
                onSelect={(value) => patch({ entryBasis: value as EntryBasis })}
              />
            </Field>
          </View>
        </View>
      )}

      <Card className="my-2">
        <UIText variant="heading" className="mb-1.5 text-sm">
          高级设置
        </UIText>
        <Field label="基准代码">
          <Input
            placeholder={DEFAULT_BENCHMARK}
            value={state.benchmarkSymbol}
            onChange={(benchmarkSymbol) => patch({ benchmarkSymbol })}
          />
        </Field>
        <View className="flex-row flex-wrap gap-2">
          <View className="flex-1 min-w-[110px]">
            <Field label="佣金率">
              <Input
                numeric
                placeholder="0.001"
                value={state.commissionRate}
                onChange={(commissionRate) => patch({ commissionRate })}
              />
            </Field>
          </View>
          <View className="flex-1 min-w-[110px]">
            <Field label="滑点">
              <Input
                numeric
                placeholder="0.01"
                value={state.slippage}
                onChange={(slippage) => patch({ slippage })}
              />
            </Field>
          </View>
          <View className="flex-1 min-w-[110px]">
            <Field label="暖机根数">
              <Input
                numeric
                placeholder="100"
                value={state.warmupBars}
                onChange={(warmupBars) => patch({ warmupBars })}
              />
            </Field>
          </View>
        </View>
      </Card>

      {error !== null && (
        <Text testID="strategy-form-error" className="mb-2 text-xs text-up">
          {error}
        </Text>
      )}

      <Btn onPress={handleSubmit} disabled={submitting} className="mt-1 py-2.5">
        {submitting ? "回测运行中…" : "开始回测"}
      </Btn>
    </View>
  );
}
