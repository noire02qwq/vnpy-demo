/** 卡片:base-800 面板底 + line 描边 */
import { View } from "react-native";
import type { FC, ReactNode } from "react";
import { cn } from "./cn";

export const Card: FC<{ className?: string; children?: ReactNode }> = ({
  className,
  children,
}) => (
  <View className={cn("rounded-lg border border-line bg-base-800 p-3", className)}>
    {children}
  </View>
);
