/** 分段选择:2-3 选项;选中态 accent-dim 底 + accent 字(shadcn Segmented 风格) */
import { Pressable, Text, View } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}): ReturnType<FC> {
  return (
    <View
      className={cn("flex-row rounded-md border border-line bg-base-900 p-0.5", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            className={cn(
              "flex-1 items-center rounded px-2 py-1.5",
              selected ? "bg-accent-dim" : "",
            )}
          >
            <Text
              className={cn(
                "text-xs",
                selected ? "font-semibold text-accent" : "text-ink-dim",
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
