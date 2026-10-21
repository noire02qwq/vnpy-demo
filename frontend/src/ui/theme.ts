/** 全端共享主题常量:mono 数字字体按平台映射(琥珀终端 token 的 JS 侧) */
import { Platform } from "react-native";

/** 平台 → mono 字体族(纯函数,便于测试;iOS/macOS 内置 Menlo,Android 用通用 monospace) */
export function monoFontFor(os: string): string {
  if (os === "web") {
    return "ui-monospace, SFMono-Regular, Menlo, monospace";
  }
  if (os === "android") {
    return "monospace";
  }
  return "Menlo";
}

/** 当前平台 mono 字体(数字/价格/日期/run id 专用) */
export const FONT_MONO = monoFontFor(Platform.OS);
