/**
 * 策略动态表单:meta schema 驱动的参数输入与回测请求装配。
 * - 校验(validateForm)与请求装配(buildRequest)抽为导出纯函数,是测试重点;
 * - schema 驱动控件:enum → 选择器(web 用原生 <select>,native 用按钮行,不新增依赖;
 *   introspect 结论:RN 社区 Picker 已从 core 剥离,为守住"零新依赖"约束选双平台内建实现)、
 *   boolean → Switch、number/integer → TextInput(string state,提交时 Number());
 * - entry_pct/entry_basis 仅 signal 形态显示;benchmark/cost/warmup 折叠进默认展开的高级设置。
 */
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { FC, ReactNode } from "react";
import type {
  BacktestRequest,
  EntryBasis,
  StrategyMeta,
  StrategyParamValue,
  StrategySpec,
  StrategyType,
} from "../api/types";

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
  return null;
}

/** 请求装配:params 数字键 Number()、boolean 键保留;仅提交 schema 中存在且非 entry 的键 */
export function buildRequest(
  state: FormState,
  meta: StrategyMeta | undefined,
): BacktestRequest {
  const type: StrategyType = meta ? meta.type : (state.strategyType as StrategyType);

  const params: Record<string, StrategyParamValue> = {};
  if (meta) {
    for (const key of Object.keys(meta.schema)) {
      // entry 字段提升为 strategy 级字段,不落 params
      if (key === "entry_pct" || key === "entry_basis") {
        continue;
      }
      const raw = state.params[key];
      if (raw === undefined) {
        continue;
      }
      params[key] =
        meta.schema[key].type === "boolean"
          ? Boolean(raw)
          : Number(String(raw).trim());
    }
  }

  // signal 形态传 entry 字段;turtle/dca 省略(后端 StrategySpec 默认 100.0/"total")
  const isSignal = meta !== undefined && meta.signal !== null;
  const spec: StrategySpec = isSignal
    ? {
        type,
        params,
        entry_pct: toNumber(state.entryPct, 100),
        entry_basis: state.entryBasis,
      }
    : ({ type, params } as StrategySpec);

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

/** 由 meta defaults 生成初始表单状态(defaults 数值 → string;entry 字段单独入 state) */
export function createInitialState(meta: StrategyMeta | undefined): FormState {
  const params: Record<string, string | boolean> = {};
  const isSignal = meta !== undefined && meta.signal !== null;
  if (meta) {
    for (const [key, value] of Object.entries(meta.defaults)) {
      if (key === "entry_pct" || key === "entry_basis") {
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
  style?: { padding: number; borderWidth: number; borderColor: string; borderRadius: number };
  children?: ReactNode;
}

// RN 类型体系没有 DOM 内建元素,经 FC 断言桥接真实 <select>/<option>(仅 web 分支渲染)
const WebSelect = "select" as unknown as FC<WebSelectProps>;
const WebOption = "option" as unknown as FC<{ value: string; children: string }>;

/** 枚举选择器:web 用原生 select,native 用按钮行(选中项反色标记) */
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
        style={styles.select}
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
    <View style={styles.row}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={active ? styles.chipTextActive : styles.chipText}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
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
        <Text>加载策略元数据…</Text>
      </View>
    );
  }

  // strategyType 缺失(异步 metas 后到)时回退首项,渲染值再按 defaults 自愈
  const meta =
    metas.find((item) => item.type === state.strategyType) ?? metas[0];
  const isSignal = meta.signal !== null;
  const paramKeys = Object.keys(meta.schema).filter(
    (key) => key !== "entry_pct" && key !== "entry_basis",
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
        <TextInput
          style={styles.input}
          placeholder="标的代码,如 AAPL"
          value={state.symbol}
          onChangeText={(symbol) => patch({ symbol: symbol.toUpperCase() })}
        />
      </Field>

      <View style={styles.row}>
        <Field label="开始日期">
          <TextInput
            style={styles.input}
            placeholder="开始日期 YYYY-MM-DD"
            value={state.start}
            onChangeText={(start) => patch({ start })}
          />
        </Field>
        <Field label="结束日期">
          <TextInput
            style={styles.input}
            placeholder="结束日期 YYYY-MM-DD"
            value={state.end}
            onChangeText={(end) => patch({ end })}
          />
        </Field>
      </View>

      <Field label="初始资金">
        <TextInput
          style={styles.input}
          placeholder="100000"
          keyboardType="numeric"
          value={state.initialCapital}
          onChangeText={(initialCapital) => patch({ initialCapital })}
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
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={typeof raw === "string" ? raw : ""}
                onChangeText={(value) => patchParam(key, value)}
              />
            )}
          </Field>
        );
      })}

      {isSignal && (
        <View style={styles.row}>
          <Field label="仓位比例(%)">
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={DEFAULT_ENTRY_PCT}
              value={state.entryPct}
              onChangeText={(entryPct) => patch({ entryPct })}
            />
          </Field>
          <Field label="建仓基准">
            <EnumSelect
              value={state.entryBasis}
              options={["total", "cash"]}
              onSelect={(value) => patch({ entryBasis: value as EntryBasis })}
            />
          </Field>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>高级设置</Text>
        <Field label="基准代码">
          <TextInput
            style={styles.input}
            placeholder={DEFAULT_BENCHMARK}
            value={state.benchmarkSymbol}
            onChangeText={(benchmarkSymbol) => patch({ benchmarkSymbol })}
          />
        </Field>
        <View style={styles.row}>
          <Field label="佣金率">
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0.001"
              value={state.commissionRate}
              onChangeText={(commissionRate) => patch({ commissionRate })}
            />
          </Field>
          <Field label="滑点">
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0.01"
              value={state.slippage}
              onChangeText={(slippage) => patch({ slippage })}
            />
          </Field>
          <Field label="暖机根数">
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="100"
              value={state.warmupBars}
              onChangeText={(warmupBars) => patch({ warmupBars })}
            />
          </Field>
        </View>
      </View>

      {error !== null && (
        <Text style={styles.error} testID="strategy-form-error">
          {error}
        </Text>
      )}

      <Pressable
        style={[styles.submit, submitting && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitText}>开始回测</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 10 },
  label: { fontSize: 12, color: "#666666", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  select: {
    padding: 8,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 6,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipActive: { backgroundColor: "#1C1C1E", borderColor: "#1C1C1E" },
  chipText: { fontSize: 13 },
  chipTextActive: { fontSize: 13, color: "#FFFFFF" },
  section: { marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  error: { color: "#C0392B", marginBottom: 8 },
  submit: {
    backgroundColor: "#1C6EFE",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#FFFFFF", fontSize: 15 },
});
