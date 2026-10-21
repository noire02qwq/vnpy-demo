/**
 * 历史页页面体(双壳共源):listRuns(1, 20) 分页首页,FlatList 展示标的/形态/
 * 创建日期(前 10 位)/总收益率;行点击回调 onOpenRun;行内「删除」按钮
 * deleteRun 成功后刷新列表;空态「暂无回测记录」;顶部回调 onNavigateConfig。
 * 视觉:琥珀行情终端(mono 等宽数据行;收益率正 up 负 down;状态行 <n> RUNS)。
 * 自 app/history.tsx 迁入,行为不变;导航经 props 回调注入(不依赖 expo-router)。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { ListRenderItem } from "react-native";
import { ApiError, deleteRun, errorMessage, listRuns } from "../api/client";
import { formatMetric } from "../components/MetricCards";
import { StatusLine } from "../ui/StatusLine";
import { FONT_MONO } from "../ui/theme";
import type { RunSummary } from "../api/types";

/** 未知异常 → 错误码(仅 ApiError 携带 code;其余走 errorMessage 兜底文案) */
function codeOf(e: unknown): string | undefined {
  return e instanceof ApiError ? e.code : undefined;
}

/** 列表拉取参数:首页 20 条(demo 体量足够,分页交互归后续任务) */
const PAGE = 1;
const PAGE_SIZE = 20;

export interface HistoryScreenProps {
  /** 点击列表条目(携带 run id) */
  onOpenRun: (runId: string) => void;
  /** 请求返回配置页 */
  onNavigateConfig: () => void;
  /** desktop 壳探测结果;缺省不渲染后端状态(Expo 页) */
  backendOk?: boolean | null;
  /** desktop 壳重试探测回调 */
  onProbeBackend?: () => void;
}

export function HistoryScreen({
  onOpenRun,
  onNavigateConfig,
  backendOk = null,
  onProbeBackend,
}: HistoryScreenProps) {
  const [items, setItems] = useState<RunSummary[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 拉取列表;失败 Alert 中文文案并保留已有内容(空数组时呈现空态) */
  const load = useCallback(async (): Promise<void> => {
    try {
      const list = await listRuns(PAGE, PAGE_SIZE);
      setItems(list.items);
    } catch (e) {
      Alert.alert("错误", errorMessage(codeOf(e)));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await deleteRun(id);
      await load();
    } catch (e) {
      Alert.alert("错误", errorMessage(codeOf(e)));
    } finally {
      setDeletingId(null);
    }
  };

  const renderItem: ListRenderItem<RunSummary> = ({ item }) => {
    const returnText = formatMetric("total_return", item.metrics.total_return);
    const negative = returnText.trimStart().startsWith("-");
    return (
      <View style={styles.rowWrapper}>
        <Pressable style={styles.row} onPress={() => onOpenRun(item.id)}>
          <Text style={styles.symbol}>{item.request.symbol}</Text>
          <Text style={styles.type}>{item.request.strategy.type}</Text>
          <Text style={styles.date}>{item.created_at.slice(0, 10)}</Text>
          <Text style={[styles.returnText, negative ? styles.down : styles.up]}>
            {returnText}
          </Text>
        </Pressable>
        <Pressable
          style={styles.delete}
          disabled={deletingId !== null}
          onPress={() => {
            void handleDelete(item.id);
          }}
        >
          <Text style={styles.deleteText}>删除</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <Pressable onPress={onNavigateConfig}>
        <Text style={styles.linkText}>返回配置</Text>
      </Pressable>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>暂无回测记录</Text>}
      />
      <StatusLine
        backendOk={backendOk}
        onRetry={onProbeBackend}
        right={`${items.length} RUNS`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0B0A08" },
  linkText: { fontSize: 13, color: "#F2A33C", paddingVertical: 8, paddingHorizontal: 16 },
  rowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#2C251B",
  },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  symbol: {
    flex: 1.2,
    fontSize: 14,
    fontWeight: "600",
    color: "#EDE4D3",
    fontFamily: FONT_MONO,
  },
  type: { flex: 1.4, fontSize: 13, color: "#9A8E78" },
  date: { flex: 1.2, fontSize: 12, color: "#9A8E78", fontFamily: FONT_MONO },
  returnText: { flex: 1, fontSize: 13, textAlign: "right", fontWeight: "600", fontFamily: FONT_MONO },
  up: { color: "#E5484D" },
  down: { color: "#3DD68C" },
  delete: {
    marginLeft: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E5484D",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deleteText: { fontSize: 12, color: "#E5484D" },
  empty: { fontSize: 14, color: "#9A8E78", paddingVertical: 16, paddingHorizontal: 16 },
});
