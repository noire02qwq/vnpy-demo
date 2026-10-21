/**
 * 配置页页面体(双壳共源):拉取策略形态元数据 → 渲染动态表单 → 提交回测。
 * 自 app/index.tsx 迁入,行为不变;导航经 props 回调注入(不依赖 expo-router)。
 * 视觉:琥珀行情终端(base-950 底、终端状态行 signature);Expo 页不做后端探测
 * (StatusLine 传 null 仅品牌),desktop 壳探测后经 props 覆盖。
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, getStrategies, runBacktest } from "../api/client";
import { StrategyForm } from "../components/StrategyForm";
import { StatusLine } from "../ui/StatusLine";
import type { BacktestRequest, StrategyMeta } from "../api/types";

/** 未知异常 → 错误码(仅 ApiError 携带 code;其余走 errorMessage 兜底文案) */
function codeOf(e: unknown): string | undefined {
  return e instanceof ApiError ? e.code : undefined;
}

export interface ConfigScreenProps {
  /** 回测提交成功(携带后端返回的 run id) */
  onSubmit: (runId: string) => void;
  /** 请求跳转历史 */
  onOpenHistory: () => void;
  /** desktop 壳探测结果;缺省不渲染后端状态(Expo 页) */
  backendOk?: boolean | null;
  /** desktop 壳重试探测回调 */
  onProbeBackend?: () => void;
}

export function ConfigScreen({
  onSubmit,
  onOpenHistory,
  backendOk = null,
  onProbeBackend,
}: ConfigScreenProps) {
  const [metas, setMetas] = useState<StrategyMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadErrorText, setLoadErrorText] = useState("策略元数据加载失败");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStrategies()
      .then((list) => {
        if (!cancelled) {
          setMetas(list);
          setLoaded(true);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const code = codeOf(e);
          const reason =
            code === "NETWORK_ERROR" && e instanceof Error
              ? e.message
              : errorMessage(code, e instanceof Error ? e.message : undefined);
          Alert.alert("错误", reason);
          setLoadErrorText(`策略元数据加载失败:${reason}`);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (req: BacktestRequest): Promise<void> => {
    setSubmitting(true);
    try {
      const result = await runBacktest(req);
      onSubmit(result.id);
    } catch (e) {
      Alert.alert("错误", errorMessage(codeOf(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>vn-demo 回测</Text>
        <Pressable onPress={onOpenHistory}>
          <Text style={styles.linkText}>历史记录</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {loadFailed ? (
          <Text style={styles.hint}>{loadErrorText}</Text>
        ) : loaded ? (
          <StrategyForm metas={metas} onSubmit={handleSubmit} submitting={submitting} />
        ) : (
          <Text style={styles.hint}>加载策略元数据…</Text>
        )}
      </View>

      <View style={styles.statusArea}>
        <StatusLine
          backendOk={backendOk}
          onRetry={onProbeBackend}
          right={loaded ? `${metas.length} FORMS` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B0A08" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  content: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#EDE4D3" },
  linkText: { fontSize: 13, color: "#F2A33C" },
  hint: { fontSize: 14, color: "#9A8E78", paddingVertical: 12 },
  statusArea: { marginTop: "auto" },
});
