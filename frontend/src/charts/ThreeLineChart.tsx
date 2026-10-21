/**
 * 三线对比图(总资金/持仓资金/S&P500;equity 与 benchmark 为累计收益率 %,
 * 持仓资金为占初始资金 %——不减现金,空仓日为 0),
 * 起点 0,spec §7 同轴口径),web/native 同构:内部复用 LightChart 的 lines 模式
 * (import "./LightChart" 经 Metro 平台扩展解析到 LightChart.web/native 对应实现),
 * 并附图例文字标签与单位说明。
 */
import { View, Text, StyleSheet } from "react-native";
import { LightChart } from "./LightChart";
import { CHART_COLORS } from "./chart-init-script";
import type { BacktestResult } from "../api/types";

/** 三线图例(与 lines 模式的 series 顺序、配色一一对应) */
const LEGEND = [
  { label: "总资金", color: CHART_COLORS.equity },
  { label: "持仓资金(占初始资金%)", color: CHART_COLORS.position },
  { label: "S&P500", color: CHART_COLORS.benchmark },
] as const;

/** 图例单位说明(三线已归一化同轴,避免误读为绝对资金额) */
const LEGEND_NOTE = "总资金/S&P500 为累计收益率 %,持仓资金为占初始资金 %(起点 0)";

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
      <Text style={styles.legendNote}>{LEGEND_NOTE}</Text>
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
  legendNote: {
    fontSize: 11,
    color: "#888888",
    marginTop: 2,
  },
});
