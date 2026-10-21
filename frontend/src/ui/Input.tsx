/** 输入框:base-900 深底 + line 描边;numeric 时用 mono 字体与数字键盘 */
import { TextInput } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";
import { FONT_MONO } from "./theme";

export const Input: FC<{
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  numeric?: boolean;
  className?: string;
}> = ({ value, onChange, placeholder, numeric, className }) => (
  <TextInput
    accessibilityLabel={placeholder}
    value={value}
    onChangeText={onChange}
    placeholder={placeholder}
    placeholderTextColor="#9A8E78"
    keyboardType={numeric ? "decimal-pad" : "default"}
    className={cn("h-9 rounded-md border border-line bg-base-900 px-3 text-ink", className)}
    style={numeric ? { fontFamily: FONT_MONO } : undefined}
  />
);
