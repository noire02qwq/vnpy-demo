/**
 * 结果页页面体(双壳共源):按 runId 拉取回测详情并整装呈现。
 * 自 app/result/[id].tsx 迁入,行为不变;导航经 props 回调注入(不依赖 expo-router)。
 * 布局顺序:标题(标的 · 策略形态)→ MetricCards 指标卡 →「K 线与均线」
 * → 信号副图(candles.sub.macd →「MACD」/ sub.kdj →「KDJ」,按存在性渲染)
 * →「策略 vs S&P500」三线对比 →「成交明细」。删除操作归历史页,本页不放。
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, getRun } from "../api/client";
import { MetricCards } from "../components/MetricCards";
import { TradeList } from "../components/TradeList";
import { LightChart } from "../charts/LightChart";
import { ThreeLineChart } from "../charts/ThreeLineChart";
import type { BacktestResult } from "../api/types";

/** 未知异常 → 错误码(仅 ApiError 携带 code;其余走 errorMessage 兜底文案) */
function codeOf(e: unknown): string | undefined {
  return e instanceof ApiError ? e.code : undefined;
}

export interface ResultScreenProps {
  /** 回测 run id(由调用方保证非空) */
  runId: string;
  /** 请求返回 */
  onBack: () => void;
}

export function ResultScreen({ runId, onBack }: ResultScreenProps) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // 防御性重置:id 变化重拉前先清失败态,避免上一 id 的失败视图残留到新请求
    setFailed(false);
    let cancelled = false;
    getRun(runId)
      .then((data) => {
        if (!cancelled) {
          setResult(data);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          Alert.alert("错误", errorMessage(codeOf(e)));
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (failed) {
    return (
      <View style={styles.page}>
        <Text style={styles.hint}>回测结果加载失败</Text>
        <Pressable style={styles.back} onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  if (result === null) {
    return (
      <View style={styles.page}>
        <Text style={styles.hint}>加载回测结果…</Text>
      </View>
    );
  }

  const sub = result.candles.sub;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {result.request.symbol} · {result.request.strategy.type}
      </Text>

      <MetricCards metrics={result.metrics} />

      <Text style={styles.section}>K 线与均线</Text>
      <LightChart kind="candles" result={result} />

      {sub?.macd !== undefined && (
        <View>
          <Text style={styles.section}>MACD</Text>
          <LightChart kind="macd" result={result} />
        </View>
      )}
      {sub?.kdj !== undefined && (
        <View>
          <Text style={styles.section}>KDJ</Text>
          <LightChart kind="kdj" result={result} />
        </View>
      )}

      <Text style={styles.section}>策略 vs S&P500</Text>
      <ThreeLineChart result={result} />

      <Text style={styles.section}>成交明细</Text>
      <TradeList trades={result.trades} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  content: { paddingBottom: 24 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  section: { fontSize: 15, fontWeight: "600", marginVertical: 8 },
  hint: { fontSize: 14, color: "#666666", paddingVertical: 12 },
  back: {
    alignSelf: "flex-start",
    backgroundColor: "#1C6EFE",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backText: { color: "#FFFFFF", fontSize: 14 },
});
