/** 按钮:accent 主按钮 / outline 次按钮 / ghost 幽灵 / danger 危险;禁用降透明 */
import { Pressable, Text } from "react-native";
import type { FC, ReactNode } from "react";
import { cn } from "./cn";

const VARIANTS = {
  default: "bg-accent",
  outline: "border border-line bg-base-800",
  ghost: "",
  danger: "border border-up bg-base-800",
} as const;

export const Btn: FC<{
  variant?: keyof typeof VARIANTS;
  disabled?: boolean;
  onPress: () => void;
  className?: string;
  children?: ReactNode;
}> = ({ variant = "default", disabled, onPress, className, children }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    className={cn(
      "rounded-md px-4 py-2 items-center justify-center",
      VARIANTS[variant],
      disabled ? "opacity-40" : "active:opacity-80",
      className,
    )}
  >
    <Text
      className={cn(
        "text-sm",
        variant === "default" ? "text-base-950 font-semibold" : "text-ink",
        variant === "danger" && "text-up",
      )}
    >
      {children}
    </Text>
  </Pressable>
);
