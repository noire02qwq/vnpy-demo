/**
 * 指标卡片:结果页顶部横滚(ScrollView horizontal)摘要,标签 + 格式化值。
 * METRIC_LABELS(中文标签映射)与 formatMetric(格式化纯函数)导出供复用与测试;
 * 契约:null/缺省 → "—",字符串(日期)原样,百分率键 ×100 两位 + "%",
 * 其余数值保留 3 位,负数自然带符号;未入标签表的键(如 start_date)以键名兜底。
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { FC } from "react";
import type { MetricsMap } from "../api/types";

/** 指标键 → 中文标签(键序即卡片展示顺序) */
export const METRIC_LABELS: Record<string, string> = {
  total_return: "总收益率",
  annual_return: "年化收益率",
  alpha_annual: "Alpha",
  beta: "Beta",
  max_drawdown: "最大回撤",
  annual_volatility: "年化波动率",
  sharpe_ratio: "夏普比率",
  information_ratio: "信息比率",
  total_trade_count: "交易次数",
  total_commission: "总佣金",
  return_drawdown_ratio: "收益回撤比",
  total_days: "回测天数",
};

/** 百分率类键:值 ×100 保留两位小数后跟 "%" */
const PERCENT_KEYS: ReadonlySet<string> = new Set([
  "total_return",
  "annual_return",
  "max_drawdown",
  "annual_volatility",
]);

/**
 * 指标值格式化(纯函数):null/缺省 → "—";字符串(如 start/end 日期)原样;
 * 百分率键 → (×100).toFixed(2)%;其余数值 → toFixed(3);负数正常带符号。
 */
export function formatMetric(key: string, value: number | string | null): string {
  if (value == null) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (PERCENT_KEYS.has(key)) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return value.toFixed(3);
}

/** 横滚指标卡片:先按 METRIC_LABELS 键序展示,metrics 中其余键追加尾部 */
export const MetricCards: FC<{ metrics: MetricsMap }> = ({ metrics }) => {
  const labeled = Object.keys(METRIC_LABELS).filter((key) => key in metrics);
  const extra = Object.keys(metrics).filter((key) => !(key in METRIC_LABELS));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.row}
    >
      {[...labeled, ...extra].map((key) => (
        <View key={key} style={styles.card}>
          <Text style={styles.label}>{METRIC_LABELS[key] ?? key}</Text>
          <Text style={styles.value}>{formatMetric(key, metrics[key])}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  card: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: { fontSize: 11, color: "#666666", marginBottom: 2 },
  value: { fontSize: 14, fontWeight: "600" },
});
