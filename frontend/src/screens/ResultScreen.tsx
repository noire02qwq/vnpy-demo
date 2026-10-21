/**
 * 结果页页面体(双壳共源):按 runId 拉取回测详情并整装呈现。
 * 自 app/result/[id].tsx 迁入,行为不变;导航经 props 回调注入(不依赖 expo-router)。
 * 视觉:琥珀行情终端(base-950 底、mono 状态行:RUN <id> · <n> TRADES)。
 * 布局顺序:标题(标的 · 策略形态)→ MetricCards 指标卡 →「K 线与均线」
 * → 信号副图(candles.sub.macd →「MACD」/ sub.kdj →「KDJ」,按存在性渲染)
 * →「策略 vs S&P500」三线对比 →「成交明细」。删除操作归历史页,本页不放。
 */
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, getRun } from "../api/client";
import { MetricCards } from "../components/MetricCards";
import { TradeList } from "../components/TradeList";
import { LightChart } from "../charts/LightChart";
import { ThreeLineChart } from "../charts/ThreeLineChart";
import { Btn } from "../ui/Button";
import { StatusLine } from "../ui/StatusLine";
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
  /** desktop 壳探测结果;缺省不渲染后端状态(Expo 页) */
  backendOk?: boolean | null;
  /** desktop 壳重试探测回调 */
  onProbeBackend?: () => void;
}

export function ResultScreen({
  runId,
  onBack,
  backendOk = null,
  onProbeBackend,
}: ResultScreenProps) {
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
        <Btn variant="outline" onPress={onBack} className="self-start">
          返回
        </Btn>
        <View style={styles.statusArea}>
          <StatusLine backendOk={backendOk} onRetry={onProbeBackend} />
        </View>
      </View>
    );
  }

  if (result === null) {
    return (
      <View style={styles.page}>
        <Text style={styles.hint}>加载回测结果…</Text>
        <View style={styles.statusArea}>
          <StatusLine backendOk={backendOk} onRetry={onProbeBackend} />
        </View>
      </View>
    );
  }

  const sub = result.candles.sub;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
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
      <StatusLine
        backendOk={backendOk}
        onRetry={onProbeBackend}
        right={`RUN ${runId} · ${result.trades.length} TRADES`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B0A08" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#EDE4D3",
    marginBottom: 8,
  },
  section: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EDE4D3",
    marginTop: 14,
    marginBottom: 6,
  },
  hint: { fontSize: 14, color: "#9A8E78", paddingVertical: 12, paddingHorizontal: 16 },
  statusArea: { marginTop: "auto" },
});
