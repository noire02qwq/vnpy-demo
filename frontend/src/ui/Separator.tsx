/** 分隔线:line 色细线 */
import { View } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

export const Separator: FC<{ className?: string }> = ({ className }) => (
  <View className={cn("h-px w-full bg-line", className)} />
);
