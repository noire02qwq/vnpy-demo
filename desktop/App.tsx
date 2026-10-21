import "./global.css";
/**
 * 桌面壳:左侧栏(回测配置/历史记录)+ 主区共享 screens。
 * - 导航经 navReducer 纯状态机(TDD 于 frontend/__tests__/desktop-logic.test.ts);
 * - 挂载时探测一次后端 healthz(失败可点状态行重试,不轮询);
 * - StatusLine 由各 screen 自渲染,探测值经 props 注入(Expo 页缺省仅品牌)。
 */
import { useCallback, useEffect, useReducer, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ConfigScreen } from "../frontend/src/screens/ConfigScreen";
import { HistoryScreen } from "../frontend/src/screens/HistoryScreen";
import { ResultScreen } from "../frontend/src/screens/ResultScreen";
import { API_BASE } from "../frontend/src/api/client";
import { navReducer, initialState } from "./src/navigation";
import { probeBackend } from "./src/health";

/** 侧栏项(桌面三屏中的两个 tab;结果页经行点击/提交进入) */
const TABS = [
  { key: "config", label: "回测配置" },
  { key: "history", label: "历史记录" },
] as const;

export default function App() {
  const [state, dispatch] = useReducer(navReducer, initialState);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  const probe = useCallback(() => {
    void probeBackend(API_BASE).then(setBackendOk);
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  const screen =
    state.route.name === "config" ? (
      <ConfigScreen
        backendOk={backendOk}
        onProbeBackend={probe}
        onSubmit={(runId) => dispatch({ type: "openRun", runId, from: "config" })}
        onOpenHistory={() => dispatch({ type: "selectTab", tab: "history" })}
      />
    ) : state.route.name === "history" ? (
      <HistoryScreen
        backendOk={backendOk}
        onProbeBackend={probe}
        onOpenRun={(runId) => dispatch({ type: "openRun", runId, from: "history" })}
        onNavigateConfig={() => dispatch({ type: "selectTab", tab: "config" })}
      />
    ) : (
      <ResultScreen
        runId={state.route.runId}
        onBack={() => dispatch({ type: "back" })}
        backendOk={backendOk}
        onProbeBackend={probe}
      />
    );

  return (
    <View className="flex-1 flex-row bg-base-950">
      <View className="w-44 border-r border-line bg-base-900 py-3">
        <Text className="px-4 pb-3 text-xs text-ink-dim" style={{ fontFamily: "Menlo" }}>
          VND-DEMO
        </Text>
        {TABS.map((tab) => {
          const active =
            state.route.name === tab.key ||
            (state.route.name === "result" && state.returnTo === tab.key);
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => dispatch({ type: "selectTab", tab: tab.key })}
              className={
                active
                  ? "mx-2 my-0.5 rounded-md bg-accent-dim px-3 py-2"
                  : "mx-2 my-0.5 rounded-md px-3 py-2"
              }
            >
              <Text
                className={
                  active ? "text-sm font-semibold text-accent" : "text-sm text-ink-dim"
                }
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-1">{screen}</View>
    </View>
  );
}
