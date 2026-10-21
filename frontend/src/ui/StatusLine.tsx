/** 终端状态行(signature):品牌 + 后端连通点(可点重试)+ 右侧上下文;全行 mono */
import { Pressable, Text, View } from "react-native";
import type { FC, ReactNode } from "react";
import { cn } from "./cn";
import { FONT_MONO } from "./theme";

const STATE_TEXT: Record<"probing" | "online" | "offline", string> = {
  probing: "PROBING",
  online: "BACKEND ONLINE",
  offline: "BACKEND OFFLINE",
};

const STATE_COLOR: Record<"probing" | "online" | "offline", string> = {
  probing: "bg-ink-dim",
  online: "bg-down",
  offline: "bg-up",
};

export const StatusLine: FC<{
  backendOk: boolean | null;
  onRetry?: () => void;
  right?: ReactNode;
  className?: string;
}> = ({ backendOk, onRetry, right, className }) => {
  const state = backendOk === null ? null : backendOk ? "online" : "offline";
  return (
    <View
      className={cn(
        "flex-row items-center border-t border-line bg-base-900 px-4 py-2",
        className,
      )}
    >
      <Text className="text-xs text-ink-dim" style={{ fontFamily: FONT_MONO }}>
        VND-DEMO
      </Text>
      {state !== null && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          disabled={!onRetry}
          className="ml-3 flex-row items-center"
        >
          <View className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", STATE_COLOR[state])} />
          <Text className="text-xs text-ink-dim" style={{ fontFamily: FONT_MONO }}>
            {STATE_TEXT[state]}
          </Text>
        </Pressable>
      )}
      {right !== undefined && (
        <Text
          className="ml-auto text-xs text-ink-dim"
          style={{ fontFamily: FONT_MONO }}
          numberOfLines={1}
        >
          {right}
        </Text>
      )}
    </View>
  );
};
