/**
 * 配置页:拉取策略形态元数据 → 渲染动态表单 → 提交回测并跳转结果页。
 * - 元数据就绪前显示加载文案;就绪后才挂载 StrategyForm(规避组件内部 params
 *   不随异步 metas 重置的已知问题,见 findings「前端(F5)」);
 * - 加载失败 Alert 中文文案并给失败提示;提交失败 Alert 且停留在本页。
 */
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { ApiError, errorMessage, getStrategies, runBacktest } from "../src/api/client";
import { StrategyForm } from "../src/components/StrategyForm";
import type { BacktestRequest, StrategyMeta } from "../src/api/types";

/** 未知异常 → 错误码(仅 ApiError 携带 code;其余走 errorMessage 兜底文案) */
function codeOf(e: unknown): string | undefined {
  return e instanceof ApiError ? e.code : undefined;
}

export default function Index() {
  const router = useRouter();
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
      router.push(`/result/${result.id}`);
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
        <Link href="/history">
          <Text style={styles.linkText}>历史记录</Text>
        </Link>
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
  link: { paddingVertical: 6 },
  linkText: { fontSize: 14, color: "#1C6EFE" },
  hint: { fontSize: 14, color: "#666666", paddingVertical: 12 },
});
