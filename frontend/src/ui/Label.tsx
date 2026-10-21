/** 字段标签:ink-dim 小字 */
import { Text } from "react-native";
import type { FC, ReactNode } from "react";
import { cn } from "./cn";

export const Label: FC<{ className?: string; children?: ReactNode }> = ({
  className,
  children,
}) => <Text className={cn("mb-1 text-xs text-ink-dim", className)}>{children}</Text>;
