/** 文本:UI 文字体系(default/muted/heading/mono;数字一律 mono) */
import { Text as RNText } from "react-native";
import type { FC, ReactNode } from "react";
import { cn } from "./cn";
import { FONT_MONO } from "./theme";

const VARIANTS = {
  default: "",
  muted: "",
  heading: "font-bold",
  mono: "font-semibold",
} as const;

export const UIText: FC<{
  variant?: keyof typeof VARIANTS;
  className?: string;
  children?: ReactNode;
}> = ({ variant = "default", className, children }) => (
  <RNText
    className={cn("text-ink", variant === "muted" && "text-ink-dim", VARIANTS[variant], className)}
    style={variant === "mono" ? { fontFamily: FONT_MONO } : undefined}
  >
    {children}
  </RNText>
);
