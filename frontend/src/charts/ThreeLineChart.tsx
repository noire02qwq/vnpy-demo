/**
 * 三线对比图(总资金/持仓资金/S&P500,基准线为首值 0.0 的累计收益率;equity/position 为绝对资金额),web/native 同构:
 * 内部复用 LightChart 的 lines 模式(import "./LightChart" 经 Metro 平台扩展
 * 解析到 LightChart.web/native 对应实现),并附图例文字标签。
 */
import { View, Text, StyleSheet } from "react-native";
import { LightChart } from "./LightChart";
import { CHART_COLORS } from "./chart-init-script";
import type { BacktestResult } from "../api/types";

/** 三线图例(与 lines 模式的 series 顺序、配色一一对应) */
const LEGEND = [
  { label: "总资金", color: CHART_COLORS.equity },
  { label: "持仓资金", color: CHART_COLORS.position },
  { label: "S&P500", color: CHART_COLORS.benchmark },
] as const;

export function ThreeLineChart({ result }: { result: BacktestResult }) {
  return (
    <View>
      <LightChart kind="lines" result={result} />
      <View style={styles.legend}>
        {LEGEND.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#333333",
  },
});
