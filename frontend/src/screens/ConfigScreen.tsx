/**
 * 配置页页面体(双壳共源):拉取策略形态元数据 → 渲染动态表单 → 提交回测。
 * 自 app/index.tsx 迁入,行为不变;导航经 props 回调注入(不依赖 expo-router):
 * - 元数据就绪前显示加载文案;就绪后才挂载 StrategyForm(规避组件内部 params
 *   不随异步 metas 重置的已知问题,见 findings「前端(F5)」);
 * - 加载失败 Alert 中文文案并给失败提示;提交失败 Alert 且停留在本页;
 * - 提交成功回调 onSubmit(runId);「历史记录」回调 onOpenHistory。
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, errorMessage, getStrategies, runBacktest } from "../api/client";
import { StrategyForm } from "../components/StrategyForm";
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
}

export function ConfigScreen({ onSubmit, onOpenHistory }: ConfigScreenProps) {
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

      {loadFailed ? (
        <Text style={styles.hint}>{loadErrorText}</Text>
      ) : loaded ? (
        <StrategyForm metas={metas} onSubmit={handleSubmit} submitting={submitting} />
      ) : (
        <Text style={styles.hint}>加载策略元数据…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700" },
  linkText: { fontSize: 14, color: "#1C6EFE" },
  hint: { fontSize: 14, color: "#666666", paddingVertical: 12 },
});
