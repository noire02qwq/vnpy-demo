# 桌面 RN-macOS 化 + 琥珀行情终端 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面端以 react-native-macos 0.83 独立 app 替代 Electron(双壳共源),前端以 uniwind(Tailwind v4)+ shadcn 风格组件体系重设计三页,视觉 = 琥珀行情终端(深色固定)。

**Architecture:** frontend(Expo 58)保持 iOS/Android/Web;`src/` 为共享层(api/charts/components/ui/screens),desktop 为 react-native-macos 独立 app,经 Metro watchFolders + uniwind `@source` 共享;三页页面体抽为 `src/screens/*`(导航经 props 回调注入)。

**Tech Stack:** uniwind 1.13 + tailwindcss 4、react-native-reusables(轻量集)、react-native-macos 0.83、react-native-webview 14(Fabric)、Expo SDK 58 / RN 0.88、jest-expo + RNTL 14。

**Spec:** `docs/superpowers/specs/2026-10-21-desktop-rnmacos-shadcn-design.md`

## Global Constraints

- 分支 `feat-desktop-rn-macos`;每任务全绿即 commit+push(中文 conventional commits,footer `Co-Authored-By: Claude Code <noreply@anthropic.com>`)
- TDD 铁律:先写失败测试再实现(配置/spike 文件除外,spike 结论必须落 findings.md)
- Token 值逐字固定:`base-950 #0B0A08 / base-900 #14110D / base-800 #1E1913 / line #2C251B / ink #EDE4D3 / ink-dim #9A8E78 / accent #F2A33C / accent-dim #F2A33C22 / up #E5484D / down #3DD68C`
- 图表 marker/MACD 柱配色不动(`CHART_COLORS.up #26a69a / down #ef5350` 等);只动背景/文字/网格
- 现有测试语义零回退(前端基线 114 passed / 7 suites;后端不动 111 passed)
- 数字一律 mono(`FONT_MONO`);后端零改动;不新增 light 主题
- spike 结论全部追加进 findings.md;S0 任一环不可行 → 停下回报,不带病推进

---

### Task 1: S0a-spike — frontend 接入 uniwind 最小验证

**Files:**
- Modify: `frontend/package.json`(依赖)、`frontend/metro.config.js`(新建)、`frontend/global.css`(新建)、`frontend/app/_layout.tsx`(css import)
- Test: `frontend/__tests__/uniwind-contract.test.tsx`(新建)

- [ ] **Step 1: 安装依赖**

```bash
cd frontend && npm install uniwind tailwindcss@4
npm view uniwind peerDependencies --json   # 确认 react-native>=0.81 满足
```

- [ ] **Step 2: 最小 metro + css 接线**(按 uniwind quickstart 实际选项名微调)

```js
// frontend/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind.d.ts",
});
```

```css
/* frontend/global.css */
@import "tailwindcss";
@theme {
  --color-base-950: #0B0A08;
  --color-accent: #F2A33C;
  --color-ink: #EDE4D3;
}
```

`app/_layout.tsx` 顶部加 `import "../global.css";`(web 需要;native 若 metro cssEntryFile 已注入则此行无害)。

- [ ] **Step 3: 写 jest 契约测试(先跑,预期可能直接通过=验证性质)**

```tsx
// frontend/__tests__/uniwind-contract.test.tsx
/** uniwind×jest 契约:className 组件在 jest-expo(native preset)下可渲染不崩 */
import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

it("className 组件在 jest 下可渲染", async () => {
  const { getByText } = await render(
    <View className="flex-1 bg-base-950">
      <Text className="text-ink">vn-demo</Text>
    </View>,
  );
  expect(getByText("vn-demo")).toBeTruthy();
});
```

Run: `cd frontend && npm test -- uniwind-contract`
Expected: PASS(若 RN 对 className prop 崩溃:查 uniwind 文档 testing/jest 配置;查不到解法 → STOP 回报)

- [ ] **Step 4: 验证 tsc + web 导出**

Run: `cd frontend && npx tsc --noEmit && CI=1 npx expo export -p web`
Expected: 双双 exit 0(export 产物含 css)。

- [ ] **Step 5: 落 findings + commit**

findings.md 追加「S0a 实测:withUniwindConfig 实际选项名 / jest 契约结果 / export 产物 css 证据」。

```bash
git add -A && git commit -m "chore(frontend): uniwind 接入 spike(metro+css+jest 契约)" && git push
```

### Task 2: S0b-spike — react-native-macos 0.83 init + webview 图表冒烟

**Files:** 全部在 /tmp 临时目录验证,保留结论;可行则该工程骨架迁入 `desktop/`(Task 15 正式化)。

- [ ] **Step 1: init + macos-init**

```bash
cd /tmp && npx -y @react-native-community/cli@latest init VndemoDesktop --version 0.83.0 --skip-install
cd VndemoDesktop && npx -y react-native-macos-init && npm install
```
若 macos-init 不支持 0.83.0 → 降级 `--version 0.81.2`(npm `0.81-stable`=0.81.9),仍失败 → STOP 回报。

- [ ] **Step 2: 构建冒烟**

```bash
cd /tmp/VndemoDesktop && npx react-native run-macos   # 需 Xcode;首次 pod install 较久
```
Expected: 窗口弹出。失败信息原样记录。

- [ ] **Step 3: webview 图表冒烟**

`npm install react-native-webview@14`,App.tsx 换成 `<WebView source={{ html: '<h1 style="color:#F2A33C">chart-ok</h1>' }} style={{flex:1}} />`,run-macos 复跑。Expected: 窗口内显示琥珀色文案(webview 渲染成立)。

- [ ] **Step 4: 结论落 findings**(RN 版本定案 0.83 还是 0.81、react-native 别名机制是否由模板 metro 提供、webview 结论),临时目录保留待 Task 15 复用;commit findings。

### Task 3: S0c-spike — rnr 组件落地路径

- [ ] **Step 1: CLI 试跑**:`cd /tmp && npx -y @react-native-reusables/cli@latest init --help`,确认 init/add 用法与对既有工程的支持。
- [ ] **Step 2: 判定主路径**:
  - 主路径(CLI 可用):frontend 内初始化,加 Button/Input/Label/Card/Separator/Text 六件 → 落 `frontend/src/ui/`;依赖:`react-native-reusables` + `clsx`(+ `tailwind-merge` 仅当其组件 require)
  - 备路径(CLI 不可用):从 rnr 仓库手工复制同六件组件源码进 `src/ui/`,依赖同上(组件本就是 copy-paste 设计)
- [ ] **Step 3: jest 解析验证**:任选一件(如 Button)写冒烟渲染测试;若 jest 因 ESM 解析失败 → package.json 的 `jest.transformIgnorePatterns` 正则追加 `react-native-reusables|@rn-primitives` 后重试。
- [ ] **Step 4: 结论落 findings + commit**(确立 Task 5/6 的实现基底)。

### Task 4: token 体系(global.css 全量 + theme 常量 + cn)

**Files:**
- Modify: `frontend/global.css`(全量 token)
- Create: `frontend/src/ui/theme.ts`、`frontend/src/ui/cn.ts`
- Test: `frontend/__tests__/ui-theme.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/__tests__/ui-theme.test.ts
/** token 常量契约:mono 字体按平台映射、cn 拼接去重语义 */
import { Platform } from "react-native";
import { FONT_MONO } from "../src/ui/theme";
import { cn } from "../src/ui/cn";

describe("FONT_MONO", () => {
  it("android 用 monospace 家族", () => {
    jest.spyOn(Platform, "OS", "get").mockReturnValue("android");
    expect(FONT_MONO).toBe("monospace");
  });
  it("ios/macos 用 Menlo", () => {
    jest.spyOn(Platform, "OS", "get").mockReturnValue("macos");
    expect(FONT_MONO).toBe("Menlo");
  });
  it("web 用等宽字体栈", () => {
    jest.spyOn(Platform, "OS", "get").mockReturnValue("web");
    expect(FONT_MONO).toContain("monospace");
  });
});

describe("cn", () => {
  it("拼接多个 class", () => expect(cn("a", "b")).toBe("a b"));
  it("过滤假值", () => expect(cn("a", false, undefined, "b")).toBe("a b"));
});
```

Run: `cd frontend && npm test -- ui-theme` → Expected: FAIL(module not found)

- [ ] **Step 2: 实现**

```ts
// frontend/src/ui/theme.ts
/** 全端共享主题常量:mono 数字字体按平台映射(设计 token 的 JS 侧) */
import { Platform } from "react-native";

export const FONT_MONO =
  Platform.OS === "web"
    ? "ui-monospace, SFMono-Regular, Menlo, monospace"
    : Platform.OS === "android"
      ? "monospace"
      : "Menlo";
```

```ts
// frontend/src/ui/cn.ts
/** className 拼接(shadcn 惯例签名;tailwind-merge 不引入,冲突类由组件内部受控) */
type ClassValue = string | false | null | undefined;

export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}
```

global.css 补全为 spec §4.1 全量 token(base-950/900/800、line、ink、ink-dim、accent、accent-dim、up、down)。

- [ ] **Step 3: 跑绿 + 全量回归**:`npm test` → 115 passed 级别,`npx tsc --noEmit` exit 0。
- [ ] **Step 4: commit** `feat(frontend): 琥珀终端 token 体系与 cn 工具`。

### Task 5: ui 基础件(Text/Button/Separator/Card)

**Files:**
- Create: `frontend/src/ui/Text.tsx`、`Button.tsx`、`Separator.tsx`、`Card.tsx`
- Test: `frontend/__tests__/ui-basics.test.tsx`

- [ ] **Step 1: 失败测试**

```tsx
// frontend/__tests__/ui-basics.test.tsx
/** ui 基础件:渲染、交互、禁用态、变体语义 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Btn } from "../src/ui/Button";
import { Card } from "../src/ui/Card";
import { Separator } from "../src/ui/Separator";
import { UIText } from "../src/ui/Text";

it("Button 渲染标签并响应点击", async () => {
  const onPress = jest.fn();
  const { getByText } = await render(<Btn onPress={onPress}>开始回测</Btn>);
  fireEvent.press(getByText("开始回测"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("Button disabled 不响应且带禁用类", async () => {
  const onPress = jest.fn();
  const { getByText } = await render(
    <Btn onPress={onPress} disabled>提交</Btn>,
  );
  fireEvent.press(getByText("提交"));
  expect(onPress).not.toHaveBeenCalled();
});

it("UIText variant=mono 应用等宽字体类", async () => {
  const { getByText } = await render(<UIText variant="mono">1,234.56</UIText>);
  expect(getByText("1,234.56")).toBeTruthy();
});

it("Card/Separator 渲染子内容", async () => {
  const { getByText } = await render(
    <Card><UIText>内容</UIText><Separator /></Card>,
  );
  expect(getByText("内容")).toBeTruthy();
});
```

Run → FAIL(模块不存在)。

- [ ] **Step 2: 实现**(shadcn API 风格,uniwind className;以 Task 3 确定的 rnr 基底为准,以下为自研形态的完整实现,若 rnr 基底则对齐其 API 并保持本测试通过)

```tsx
// frontend/src/ui/Text.tsx
/** 文本:UI 文字体系(muted/heading/mono 变体;数字一律 mono) */
import { Text as RNText } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

const VARIANTS = {
  default: "text-ink",
  muted: "text-ink-dim",
  heading: "text-ink font-bold",
  mono: "text-ink",
} as const;

export const UIText: FC<{
  variant?: keyof typeof VARIANTS;
  className?: string;
  children?: React.ReactNode;
}> = ({ variant = "default", className, children }) => (
  <RNText className={cn(VARIANTS[variant], className)}>{children}</RNText>
);
```

```tsx
// frontend/src/ui/Button.tsx
/** 按钮:accent 主按钮 / outline 次按钮 / ghost 幽灵;禁用降透明 */
import { Pressable, Text } from "react-native";
import type { FC } from "react";
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
  children?: React.ReactNode;
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
      )}
    >
      {children}
    </Text>
  </Pressable>
);
```

```tsx
// frontend/src/ui/Separator.tsx
/** 分隔线 */
import { View } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

export const Separator: FC<{ className?: string }> = ({ className }) => (
  <View className={cn("h-px bg-line w-full", className)} />
);
```

```tsx
// frontend/src/ui/Card.tsx
/** 卡片:面板底 + line 描边 */
import { View } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

export const Card: FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => (
  <View className={cn("rounded-lg border border-line bg-base-800 p-3", className)}>
    {children}
  </View>
);
```

- [ ] **Step 3: 跑绿**(`npm test -- ui-basics`)+ 全量;**Step 4: commit** `feat(frontend): ui 基础件 Text/Button/Separator/Card`。

### Task 6: ui 表单件(Input/Label/Segmented)+ StatusLine

**Files:**
- Create: `frontend/src/ui/Input.tsx`、`Label.tsx`、`Segmented.tsx`、`StatusLine.tsx`
- Test: `frontend/__tests__/ui-forms.test.tsx`

- [ ] **Step 1: 失败测试**

```tsx
// frontend/__tests__/ui-forms.test.tsx
/** 表单件与状态行:输入回传、选中态、onChange、状态行上下文与重试 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Input } from "../src/ui/Input";
import { Label } from "../src/ui/Label";
import { Segmented } from "../src/ui/Segmented";
import { StatusLine } from "../src/ui/StatusLine";

it("Input 受控输入回传文本", async () => {
  const onChange = jest.fn();
  const { getByDisplayValue } = await render(
    <Input value="AAPL" onChange={onChange} placeholder="标的" />,
  );
  fireEvent.changeText(getByDisplayValue("AAPL"), "MSFT");
  expect(onChange).toHaveBeenCalledWith("MSFT");
});

it("Label 渲染文本", async () => {
  const { getByText } = await render(<Label>标的时代</Label>);
  expect(getByText("标的时代")).toBeTruthy();
});

it("Segmented 渲染选项并回传选中", async () => {
  const onChange = jest.fn();
  const { getByText } = await render(
    <Segmented
      options={[
        { value: "cross", label: "金死叉对卖" },
        { value: "tpsl", label: "固定止盈止损" },
      ]}
      value="cross"
      onChange={onChange}
    />,
  );
  fireEvent.press(getByText("固定止盈止损"));
  expect(onChange).toHaveBeenCalledWith("tpsl");
});

it("StatusLine 渲染品牌、后端状态与右上下文", async () => {
  const onRetry = jest.fn();
  const { getByText } = await render(
    <StatusLine backendOk={false} onRetry={onRetry} right="8 FORMS · AAPL" />,
  );
  expect(getByText("VND-DEMO")).toBeTruthy();
  expect(getByText("BACKEND OFFLINE")).toBeTruthy();
  expect(getByText("8 FORMS · AAPL")).toBeTruthy();
  fireEvent.press(getByText("BACKEND OFFLINE"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
```

Run → FAIL。

- [ ] **Step 2: 实现**

```tsx
// frontend/src/ui/Input.tsx
/** 输入框:深底描边,聚焦 accent 边 */
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
    value={value}
    onChangeText={onChange}
    placeholder={placeholder}
    placeholderTextColor="#9A8E78"
    keyboardType={numeric ? "decimal-pad" : "default"}
    className={cn(
      "h-9 rounded-md border border-line bg-base-900 px-3 text-ink",
      className,
    )}
    style={numeric ? { fontFamily: FONT_MONO } : undefined}
  />
);
```

```tsx
// frontend/src/ui/Label.tsx
/** 字段标签:muted 小字 */
import { Text } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";

export const Label: FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => (
  <Text className={cn("text-xs text-ink-dim mb-1", className)}>{children}</Text>
);
```

```tsx
// frontend/src/ui/Segmented.tsx
/** 分段选择:2-3 选项;选中态 accent-dim 底 + accent 字 */
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
    <View className={cn("flex-row rounded-md border border-line bg-base-900 p-0.5", className)}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded px-2 py-1.5 items-center",
              selected ? "bg-accent-dim" : "",
            )}
          >
            <Text className={cn("text-xs", selected ? "text-accent font-semibold" : "text-ink-dim")}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

```tsx
// frontend/src/ui/StatusLine.tsx
/** 终端状态行(signature):品牌 + 后端连通点(可点重试)+ 右侧上下文;mono */
import { Pressable, Text, View } from "react-native";
import type { FC } from "react";
import { cn } from "./cn";
import { FONT_MONO } from "./theme";

export const StatusLine: FC<{
  backendOk: boolean | null;
  onRetry?: () => void;
  right?: string;
  className?: string;
}> = ({ backendOk, onRetry, right, className }) => (
  <View className={cn("flex-row items-center border-t border-line px-4 py-2 bg-base-900", className)}>
    <Text className="text-xs text-ink-dim" style={{ fontFamily: FONT_MONO }}>
      VND-DEMO
    </Text>
    <Pressable
      accessibilityRole="button"
      onPress={onRetry}
      disabled={!onRetry}
      className="ml-3 flex-row items-center"
    >
      <View
        className={cn(
          "h-1.5 w-1.5 rounded-full mr-1.5",
          backendOk === null ? "bg-ink-dim" : backendOk ? "bg-down" : "bg-up",
        )}
      />
      <Text className="text-xs text-ink-dim" style={{ fontFamily: FONT_MONO }}>
        {backendOk === null ? "PROBING" : backendOk ? "BACKEND ONLINE" : "BACKEND OFFLINE"}
      </Text>
    </Pressable>
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
```

- [ ] **Step 3: 跑绿 + tsc;Step 4: commit** `feat(frontend): ui 表单件与终端状态行`。

### Task 7: ConfigScreen 抽取(行为不变重构)

**Files:**
- Create: `frontend/src/screens/ConfigScreen.tsx`
- Modify: `frontend/app/index.tsx`(薄壳化)、`frontend/__tests__/pages.test.tsx` → 更名 `screens.test.tsx`(配置页用例改直渲 screen)
- 契约:`export interface ConfigScreenProps { onSubmit: (runId: string) => void; onOpenHistory: () => void }`

- [ ] **Step 1: 先迁移测试(RED)**:`pages.test.tsx` 更名;「配置页」describe 改为渲染 `<ConfigScreen onSubmit={jest.fn()} onOpenHistory={jest.fn()} />`,原 `router.push` 断言改为 `onSubmit`/`onOpenHistory` mock 断言;「提交成功跳结果页」用例断言 `onSubmit` 收到 `result.id`。Run → FAIL(模块不存在)。
- [ ] **Step 2: 实现**:app/index.tsx 全部页面体(useState/useEffect/handleSubmit/JSX)迁入 `src/screens/ConfigScreen.tsx`;两处替换:`router.push(...)` → `props.onSubmit(result.id)`、`<Link href="/history">` → `<Pressable onPress={onOpenHistory}>`;文件头注释保留原语义并注明「导航经 props 注入(双壳共源)」。`app/index.tsx` 重写为:

```tsx
/** 配置页薄壳:路由适配(双壳共源,页面体在 src/screens/ConfigScreen) */
import { useRouter } from "expo-router";
import { ConfigScreen } from "../src/screens/ConfigScreen";

export default function Index() {
  const router = useRouter();
  return (
    <ConfigScreen
      onSubmit={(runId) => void router.push(`/result/${runId}`)}
      onOpenHistory={() => void router.push("/history")}
    />
  );
}
```

- [ ] **Step 3: 跑绿全量 + tsc;Step 4: commit** `refactor(frontend): 配置页体抽为 ConfigScreen(导航 props 注入)`。

### Task 8: ResultScreen 抽取

**Files:** Create `frontend/src/screens/ResultScreen.tsx`;Modify `frontend/app/result/[id].tsx`、`screens.test.tsx`
- 契约:`export interface ResultScreenProps { runId: string; onBack: () => void }`(id 由薄壳保证非 undefined;屏内 effect 依赖 `[runId]`,重拉前 `setFailed(false)` 语义保留)

- [ ] **Step 1: 测试迁移(RED)**:结果页用例改渲 `<ResultScreen runId="run-1" onBack={jest.fn()} />`;`__routeParams` 机制改为直接 rerender 换 `runId`;`router.back` 断言改 `onBack`。
- [ ] **Step 2: 实现**:页面体迁入,`router.back()` → `onBack()`;薄壳:

```tsx
/** 结果页薄壳:路由 id → ResultScreen */
import { useLocalSearchParams, useRouter } from "expo-router";
import { ResultScreen } from "../../src/screens/ResultScreen";

export default function ResultPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (params.id === undefined) {
    return null;
  }
  return <ResultScreen runId={params.id} onBack={() => void router.back()} />;
}
```

- [ ] **Step 3: 跑绿;Step 4: commit** `refactor(frontend): 结果页体抽为 ResultScreen`。

### Task 9: HistoryScreen 抽取

**Files:** Create `frontend/src/screens/HistoryScreen.tsx`;Modify `frontend/app/history.tsx`、`screens.test.tsx`
- 契约:`export interface HistoryScreenProps { onOpenRun: (runId: string) => void; onNavigateConfig: () => void }`

- [ ] **Step 1: 测试迁移(RED)**:历史页用例改渲 screen,`router.push('/result/<id>')` 断言改 `onOpenRun(id)`,「返回配置」断言改 `onNavigateConfig`。
- [ ] **Step 2: 实现**(迁移规则同 Task 7/8);薄壳:

```tsx
/** 历史页薄壳:路由适配 */
import { useRouter } from "expo-router";
import { HistoryScreen } from "../src/screens/HistoryScreen";

export default function HistoryPage() {
  const router = useRouter();
  return (
    <HistoryScreen
      onOpenRun={(runId) => void router.push(`/result/${runId}`)}
      onNavigateConfig={() => void router.push("/")}
    />
  );
}
```

- [ ] **Step 3: 跑绿;Step 4: commit** `refactor(frontend): 历史页体抽为 HistoryScreen`。

### Task 10: 配置页重设计(StrategyForm className 化 + StatusLine)

**Files:**
- Modify: `frontend/src/components/StrategyForm.tsx`(仅渲染层:StyleSheet → className;逻辑/props/校验逐字保留)、`frontend/src/screens/ConfigScreen.tsx`(布局 + StatusLine)
- Test: `screens.test.tsx` / `strategy-form` 相关用例断言文案与行为不变,仅当断言含样式字面量时同步

- [ ] **Step 1: 测试先行**:为 ConfigScreen 增两条用例(RED):① 渲染含 StatusLine「VND-DEMO」;② 加载失败态仍呈现「策略元数据加载失败」+ 状态行(回归保护)。
- [ ] **Step 2: StrategyForm 样式映射表落地**(逻辑零改动,逐 key 替换):

| 旧 styles key | 新 className |
|---|---|
| 容器/分组卡片 | `rounded-lg border border-line bg-base-900 p-3`(Card) |
| 字段标签 | `text-xs text-ink-dim mb-1`(Label) |
| 文本/数字输入 | Input 组件(`h-9 rounded-md border border-line bg-base-900 px-3 text-ink`,数字 + `FONT_MONO`) |
| 主提交按钮 | Btn(variant default:`bg-accent rounded-md px-4 py-2`,禁用 `opacity-40`) |
| 分段选择(形态/信号源/卖出比例预设) | Segmented(`bg-base-900 border-line`,选中 `bg-accent-dim text-accent`) |
| 校验错误文案 | `text-xs text-up` |
| 保留 | `Platform.OS === "web"` 分支与全部业务逻辑原样 |

- [ ] **Step 3: ConfigScreen 布局**:`bg-base-950 flex-1` 页底 + 页头(`text-heading`「vn-demo 回测」+ `text-accent`「历史记录」)+ 内容区 + 底部 `<StatusLine backendOk={null} right={`${metas.length} FORMS`} />`(配置页不做 healthz 探测,`null` = 不适用;desktop 壳层探测后传入实际值由 Task 15 处理——此处保持 null)。
- [ ] **Step 4: 跑绿全量 + tsc;Step 5: `CI=1 npx expo export -p web` 冒烟;Step 6: commit** `feat(frontend): 配置页琥珀终端重设计`。

### Task 11: 结果页重设计(MetricCards/TradeList)

**Files:** Modify `frontend/src/components/MetricCards.tsx`、`TradeList.tsx`、`frontend/src/screens/ResultScreen.tsx`

- [ ] **Step 1: 测试先行(RED)**:MetricCards 卡片值断言补充「mono 变体渲染不崩」冒烟;ResultScreen 用例补充 StatusLine 右上下文断言:`RUN <id> · <trades> TRADES`(id 用例数据 `run-1`、trades 长度用例自备)。
- [ ] **Step 2: MetricCards 映射**:卡片 `bg-base-800 border-line rounded-lg`;label `text-ink-dim`(11 号);值 `text-ink font-semibold` + `style={{fontFamily: FONT_MONO}}`(数字 mono;**formatMetric/METRIC_LABELS 逻辑零改动**,其测试不动)。
- [ ] **Step 3: TradeList 映射**:行高 `py-1.5`,表头 `text-ink-dim border-b border-line`,数值列 `text-right` + mono(tabular-nums 经 `style={{fontFamily: FONT_MONO, fontVariant:["tabular-nums"]}}` 保留);买卖配色**继续用 CHART_COLORS.up/down**(语义层不动);空态 `text-ink-dim`。
- [ ] **Step 4: ResultScreen 布局**:页底 `bg-base-950`、标题 heading、section 标题 `text-ink font-semibold text-sm tracking-wide uppercase?`(不 uppercase,中文)→ `text-sm font-semibold text-ink mt-4 mb-2`;底部 StatusLine `right={`RUN ${runId} · ${result.trades.length} TRADES`}`;失败/加载态文案色 `text-ink-dim`;返回按钮换 Btn(variant outline)。
- [ ] **Step 5: 跑绿 + tsc + export;Step 6: commit** `feat(frontend): 结果页琥珀终端重设计`。

### Task 12: 历史页重设计

**Files:** Modify `frontend/src/screens/HistoryScreen.tsx`
- [ ] **Step 1: 测试先行(RED)**:StatusLine 右上下文断言 `<n> RUNS`(items 数)。
- [ ] **Step 2: 布局映射**:行 `border-b border-line py-2.5`(等宽数据行:标的 `text-ink font-semibold` mono、形态 `text-ink-dim`、日期 mono `text-ink-dim`、收益率 mono 右对齐,正值 `text-up` 负值 `text-down` —— 解析 `formatMetric` 结果首字符 `-` 判负);删除按钮 variant danger(`border-up text-up`);空态 `text-ink-dim`;「返回配置」`text-accent`;底部 StatusLine。
- [ ] **Step 3: 跑绿 + tsc + export;Step 4: commit** `feat(frontend): 历史页琥珀终端重设计`。

### Task 13: 图表主题对齐(仅背景/文字/网格)

**Files:** Modify `frontend/src/charts/chart-init-script.ts:63-65`(html 常量串)
- [ ] **Step 1: 测试先行(RED)**:chart-init-script 测试补断言:生成 HTML 含 `#0B0A08`(背景)与 `#2C251B`(网格),且**不含** `#ffffff`/`#eeeeee`。
- [ ] **Step 2: 修改常量串(仅 4 个色值,结构不动)**:

```ts
// 旧(63-65 行)
'layout:{background:{type:"solid",color:"#ffffff"},textColor:"#333333"},' +
'grid:{vertLines:{color:"#eeeeee"},horzLines:{color:"#eeeeee"}},' +
'timeScale:{borderColor:"#dddddd"},rightPriceScale:{borderColor:"#dddddd"}';
// 新
'layout:{background:{type:"solid",color:"#0B0A08"},textColor:"#9A8E78"},' +
'grid:{vertLines:{color:"#2C251B"},horzLines:{color:"#2C251B"}},' +
'timeScale:{borderColor:"#2C251B"},rightPriceScale:{borderColor:"#2C251B"}';
```

CHART_COLORS(up/down/fast/slow/kdjJ/equity/position/benchmark)与 LightChart.web/ThreeLineChart 图例逻辑**零改动**。
- [ ] **Step 3: 跑绿(chart-data/chart-init-script/charts-smoke 全量);Step 4: commit** `feat(frontend): 图表主题对齐琥珀 token(背景/文字/网格)`。

### Task 14: desktop 导航状态机 + 健康探测(TDD)

**Files:**
- Create: `desktop/src/navigation.ts`、`desktop/src/health.ts`(若 Task 2 spike 已建 desktop 工程,直接进;否则先复制 spike 工程到 `desktop/`,清理模板演示代码)
- Test: `desktop/__tests__/navigation.test.ts`、`health.test.ts`(desktop 工程 jest 用 `jest-expo` 同款 preset?**否——desktop 是裸 RN**,用 `ts-jest`/`jest` + `@testing-library/react-native`?**决策:状态机与健康探测是纯 TS,reducer 用 node jest 即可,不引 RNTL**;`cd desktop && npx -y jest@30 --init`?为控制基建量:desktop 测试跑在 **frontend 的 jest 里**——`frontend/__tests__/desktop-logic.test.ts` 直接 import `../../desktop/src/navigation`、`../../desktop/src/health`(watchFolders 反向引用不可取,但测试文件在 frontend 内直引相对路径文件,ts-jest/jest-expo 可编译)。**采用后者**:desktop/ 只放源码,测试进 frontend 套件,零新测试基建)

- [ ] **Step 1: 失败测试(frontend 套件内)**

```ts
// frontend/__tests__/desktop-logic.test.ts
/** desktop 壳纯逻辑:导航状态机 + 后端健康探测(fetch mock) */
import { navReducer, initialState } from "../../desktop/src/navigation";
import { probeBackend } from "../../desktop/src/health";

describe("navReducer", () => {
  it("初始为 config", () => expect(initialState.route.name).toBe("config"));
  it("selectTab 切换 history", () => {
    expect(navReducer(initialState, { type: "selectTab", tab: "history" }).route).toEqual({ name: "history" });
  });
  it("openRun 进 result 并记住来源", () => {
    const s = navReducer(initialState, { type: "openRun", runId: "r1", from: "history" });
    expect(s.route).toEqual({ name: "result", runId: "r1" });
    expect(s.returnTo).toBe("history");
  });
  it("back 回到来源 tab", () => {
    const s = navReducer(initialState, { type: "openRun", runId: "r1", from: "config" });
    expect(navReducer(s, { type: "back" }).route).toEqual({ name: "config" });
  });
  it("result 态下可直切 tab(selectTab 覆盖)", () => {
    const s = navReducer(initialState, { type: "openRun", runId: "r1", from: "config" });
    expect(navReducer(s, { type: "selectTab", tab: "history" }).route).toEqual({ name: "history" });
  });
});

describe("probeBackend", () => {
  afterEach(() => jest.restoreAllMocks());
  it("healthz ok → true", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(true);
  });
  it("非 2xx → false", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(false);
  });
  it("网络异常 → false", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    await expect(probeBackend("http://localhost:8000")).resolves.toBe(false);
  });
});
```

Run → FAIL(模块不存在)。

- [ ] **Step 2: 实现**

```ts
// desktop/src/navigation.ts
/** 桌面壳导航状态机:侧栏 tab + 结果页来源回退 */
export type DesktopRoute =
  | { name: "config" }
  | { name: "history" }
  | { name: "result"; runId: string };

export interface NavState {
  route: DesktopRoute;
  returnTo: "config" | "history";
}

export type NavAction =
  | { type: "selectTab"; tab: "config" | "history" }
  | { type: "openRun"; runId: string; from: "config" | "history" }
  | { type: "back" };

export const initialState: NavState = { route: { name: "config" }, returnTo: "config" };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "selectTab":
      return { route: { name: action.tab }, returnTo: action.tab };
    case "openRun":
      return { route: { name: "result", runId: action.runId }, returnTo: action.from };
    case "back":
      return { route: { name: state.returnTo }, returnTo: state.returnTo };
  }
}
```

```ts
// desktop/src/health.ts
/** 后端健康探测:一次 healthz,不轮询;任何失败 → false */
export async function probeBackend(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: 跑绿;Step 4: commit** `feat(desktop): 导航状态机与健康探测(纯逻辑 TDD)`。

### Task 15: desktop App 集成(侧栏 + screens + uniwind + 构建)

**Files:**
- Create(在 Task 2 spike 工程基础上正式化到 `desktop/`):`desktop/App.tsx`、`desktop/global.css`、`desktop/metro.config.js`、`desktop/src/Sidebar.tsx`
- Modify: `desktop/package.json`(补 `react-native-webview`、`clsx`、uniwind、tailwindcss@4,版本对齐 frontend)、`frontend/src/api/client.ts`(导出 `API_BASE`)

- [ ] **Step 1: client.ts 导出 API_BASE(TDD)**:frontend 套件加断言 `import { API_BASE } from "../src/api/client"; expect(API_BASE).toBe("http://localhost:8000")`(jest 无该 env)→ 改 client.ts:15 为 `export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";` 并原处引用之。
- [ ] **Step 2: metro + css**:`desktop/metro.config.js`(getDefaultConfig 来自 `@react-native/metro-config`;watchFolders 加 `../frontend`;nodeModulesPaths = `[desktop/node_modules, frontend/node_modules]`;withUniwindConfig 同 frontend 选项);`desktop/global.css` 与 frontend 相同 token(单一事实源待后续抽取,双份先跑通——注释注明)。uniwind `@source: "../frontend/src"` 按 quickstart 的 monorepo 写法配置(cssEntryFile/dtsFile 或 @source 指令,以 Task 1 实测为准)。
- [ ] **Step 3: App.tsx**:

```tsx
/** 桌面壳:侧栏(配置/历史)+ 主区共享 screens + 全局状态行 */
import { useCallback, useMemo, useReducer, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native"; // 裸 RN 0.83 SafeAreaView 可用;或 View + paddingTop
import { ConfigScreen } from "../frontend/src/screens/ConfigScreen";
import { ResultScreen } from "../frontend/src/screens/ResultScreen";
import { HistoryScreen } from "../frontend/src/screens/HistoryScreen";
import { StatusLine } from "../frontend/src/ui/StatusLine";
import { navReducer, initialState } from "./src/navigation";
import { probeBackend } from "./src/health";
import { API_BASE } from "../frontend/src/api/client";

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
  useMemo(probe, [probe]); // 挂载探测一次(desktop 无 useEffect 依赖问题的替代:直接 useState 初始化器亦可,实现时任选其一并注释)

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
      <ResultScreen runId={state.route.runId} onBack={() => dispatch({ type: "back" })} />
    );

  return (
    <SafeAreaView className="flex-1 bg-base-950">
      <View className="flex-1 flex-row">
        <View className="w-44 border-r border-line bg-base-900 py-3">
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
                <Text className={active ? "text-accent font-semibold" : "text-ink-dim"}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-1">{screen}</View>
      </View>
      {state.route.name !== "result" && (
        <StatusLine backendOk={backendOk} onRetry={probe} right={API_BASE} />
      )}
    </SafeAreaView>
  );
}
```

**连锁契约变更(Task 10/12 的 StatusLine 归属)**:ConfigScreen/HistoryScreen 增可选 props `backendOk?: boolean | null; onProbeBackend?: () => void`,有值时渲染底部 StatusLine 并传值,无值时渲染 `backendOk={null}` 版本——**Expo 页面壳不传(各自页内 StatusLine 已在 Task 10/12 落地)**;为避免双状态行,desktop 态由 App 全局渲染、屏内不渲染:两 screen 增 prop `renderStatusLine?: boolean`(默认 true;desktop 传 false)。实现时保持 Expo 行为不变、desktop 关屏内行。

- [ ] **Step 4: index.js 注册 App + run-macos 构建**:Expected: 窗口出现,侧栏切换、配置表单可用、发起回测跳结果、图表 WebView 渲染(深底)。构建失败按错误信息修(常用:pod install、macos 别名、uniwind 选项)。
- [ ] **Step 5: frontend 全量回归不受影响;commit** `feat(desktop): RN-macOS 壳集成(侧栏+共享 screens+uniwind)`。

### Task 16: Electron 移除 + 文档同步 + 全绿终检 + 合 main

**Files:**
- Delete: `desktop/main.js`、`desktop/quick-start.js`、`desktop/README.md`(旧 Electron 版)
- Modify: `frontend/package.json`(删 devDep `electron` 与 scripts `desktop`/`desktop:dist`/`desktop:full`)、根 `README.md`、`frontend/README.md`、`docker/README.md`(desktop 说明)、`docker/.dockerignore`(清 stale 的 `frontend/desktop` 条目)、`CLAUDE.md`(目录树 desktop/ 段、常用命令、D3 决策描述更新为 RN-macOS)

- [ ] **Step 1: 移除 Electron 痕迹**(上列文件;`grep -rn "electron\|Electron" --exclude-dir=node_modules --exclude-dir=.git .` 复核仅剩历史类文档记录不属现行命令/结构)。
- [ ] **Step 2: 文档同步**:
  - 根 README:桌面端段改为「RN for macOS(react-native-macos),`cd desktop && npm install && npx react-native run-macos`」;已知限制表移除 Electron dist 路由条目(缺陷随 Electron 一并消失);里程碑/验收清单补本轮
  - CLAUDE.md:目录树 `desktop/` 注释改「RN-macOS 壳(共享 frontend/src)」;常用命令增 desktop 段、删 desktop:full 段
  - docker/README:注明桌面原生 app 不进容器,web 形态不变
- [ ] **Step 3: 全绿终检(输出原文进 progress.md)**:`cd backend && uv run pytest -q | tail -1`(111 不动);`cd frontend && npm test`(+desktop-logic 用例)与 `npx tsc --noEmit`;`CI=1 npx expo export -p web`;`cd desktop && npx react-native run-macos`。
- [ ] **Step 4: 收尾文档**:task_plan.md Phase 6/7 收口、findings.md 补终检、progress.md 会话小结。
- [ ] **Step 5: 合回 main**:`git checkout main && git merge --no-ff feat-desktop-rn-macos && git push origin main`(全绿前置;合并后删特性分支可选)。

## Self-Review 记录

- **Spec 覆盖**:§3 架构→Task 7/8/9/15;§4 token→Task 4;§4.4 组件→Task 5/6;§5 图表边界→Task 13;§6 测试策略→各 Task RED 步骤 + Task 14 决策(desktop 纯逻辑测试挂 frontend 套件);§7 切片→Task 1-3(S0)/4-6(S1)/7-9(S2)/10-13(S3)/14-15(S4)/16(S5);§8 验收→Task 16 Step 3。无缺口。
- **占位符扫描**:无 TBD/TODO;Task 10/11/12 以「映射表 + 逻辑零改动」形式给出完整目标态;uniwind/rnr 的 API 细节由 Task 1/3 spike 钉死后引用(计划显式声明以实测为准,属 spike 驱动而非占位)。
- **类型一致性**:`ConfigScreenProps/ResultScreenProps/HistoryScreenProps` 在 Task 7/8/9 定义、Task 15 消费一致;`navReducer/initialState/probeBackend` Task 14 定义、Task 15 消费一致;`API_BASE` Task 15 定义并复用;Task 15 对 screen 增补的 `renderStatusLine` 契约已显式写明连锁变更。
