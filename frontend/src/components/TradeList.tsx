/**
 * 成交明细列表:时间 / 方向 / 价格 / 数量,含表头。
 * 方向配色与 K 线 marker 同源(买=绿 up、卖=红 down,chart-init-script 调色板);
 * 空列表显示「回测期间无成交」。
 */
import { StyleSheet, Text, View } from "react-native";
import type { FC } from "react";
import type { Trade } from "../api/types";
import { CHART_COLORS } from "../charts/chart-init-script";

/** 方向中文文案与配色(买绿卖红,与 F2 marker 配色约定一致) */
const DIRECTION_TEXT: Record<Trade["direction"], string> = {
  buy: "买",
  sell: "卖",
};

const DIRECTION_COLOR: Record<Trade["direction"], string> = {
  buy: CHART_COLORS.up,
  sell: CHART_COLORS.down,
};

export const TradeList: FC<{ trades: Trade[] }> = ({ trades }) => {
  if (trades.length === 0) {
    return <Text style={styles.empty}>回测期间无成交</Text>;
  }
  return (
    <View>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.time]}>时间</Text>
        <Text style={[styles.cell, styles.direction]}>方向</Text>
        <Text style={[styles.cell, styles.number]}>价格</Text>
        <Text style={[styles.cell, styles.number]}>数量</Text>
      </View>
      {trades.map((trade, index) => (
        <View key={`${trade.time}-${index}`} style={styles.row}>
          <Text style={[styles.cell, styles.time]}>{trade.time}</Text>
          <Text
            style={[
              styles.cell,
              styles.direction,
              { color: DIRECTION_COLOR[trade.direction] },
            ]}
          >
            {DIRECTION_TEXT[trade.direction]}
          </Text>
          <Text style={[styles.cell, styles.number]}>{trade.price}</Text>
          <Text style={[styles.cell, styles.number]}>{trade.volume}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingVertical: 6 },
  head: { borderBottomWidth: 1, borderColor: "#E0E0E0" },
  cell: { fontSize: 13 },
  time: { flex: 2 },
  direction: { flex: 1, fontWeight: "600" },
  number: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  empty: { fontSize: 13, color: "#666666", paddingVertical: 6 },
});
