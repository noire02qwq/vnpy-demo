# 设计 spec:桌面端 RN for macOS 化 + 琥珀行情终端 UI 重设计

- 日期:2026-10-21
- 状态:用户批准(自主推进模式,免逐节评审)
- 前置调研:findings.md「桌面 RN-macOS + shadcn/tailwind 调研」两轮(react-native-macos 0.83 / uniwind 1.13 / rnr / webview macOS)

## 1. 背景与目标

原 D3 决策「桌面 = Web 产物套 Electron 壳」替换为 **React Native for macOS 原生 app**;同时以 **shadcn/tailwind 体系**(RN 侧 = uniwind + react-native-reusables)重设计前端三页与桌面壳,视觉方向 = **琥珀行情终端**(深色固定)。iOS/Android/Web 三个目标保持 Expo SDK 58 不动,后端零改动。

**验收终态**:frontend jest 全绿(基线 114 语义不回退)+ tsc 干净 + web 导出通过;desktop 为 react-native-macos app,`run-macos` 构建成功、三屏(配置/结果/历史)功能完整、图表渲染;Electron 痕迹清除;文档同步。

## 2. 范围

**做**:
1. `desktop/` 重建为 react-native-macos 0.83 独立 app(方案 A 双壳共源)
2. frontend 引入 uniwind(Tailwind v4)+ rnr 轻量组件集,三页 className 化重设计
3. 三页页面体抽为 `src/screens/`(无路由依赖,导航经 props 回调)
4. 图表主题对齐 token(仅背景/文字/网格;marker 与 MACD 柱配色不动)
5. Electron 删除 + 全部文档同步

**不做**(YAGNI):
- 不动 backend、不动 docker 编排(desktop 为本机原生 app,不进容器)
- 不做 light 主题/跟随系统(方向已定深色固定)
- 不引入自定义字体下载(mono 用系统栈)
- desktop 不做 URL 路由/深链(桌面形态无此需求,侧栏状态机足够)
- 不做后端连通轮询(启动探测一次,失败可重试)

## 3. 架构:双壳共源

```
frontend/                  # Expo 58(iOS/Android/Web)—— 栈不动,UI 重设计
├── app/                   # expo-router 三页 → 薄壳(路由适配 + Screen 渲染)
├── src/
│   ├── api/               # 零改动(EXPO_PUBLIC_API_BASE 在裸 RN 下天然回退 localhost:8000)
│   ├── charts/            # 逻辑零改动;CHART_COLORS 与 init 脚本背景/网格/文字对齐 token
│   ├── components/        # StrategyForm/MetricCards/TradeList → className 重写,逻辑与 props 保留
│   ├── ui/                # 新:rnr 轻量组件集 + Segmented/StatusLine 自研件
│   └── screens/           # 新:三页页面体(数据流+布局,导航经 props 回调注入)
├── global.css             # 新:uniwind 入口 + 琥珀 token(@theme)
└── metro.config.js        # 新:withUniwindConfig

desktop/                   # 重建:react-native-macos 0.83 独立 app
├── package.json           # react-native@0.83.x + react-native-macos@0.83.0(版本自洽)
├── macos/                 # Xcode 工程(macos-init 生成,默认 Fabric 新架构)
├── App.tsx                # 侧栏导航状态机 + 共享 screens
└── metro.config.js        # watchFolders→frontend + nodeModulesPaths + uniwind @source
```

**共享面**:`src/api`、`src/charts`、`src/ui`、`src/screens`、`src/components` 双端原样共用(全部仅依赖 react + RN 核心组件,依赖面盘点见 findings)。desktop 的 package.json 显式声明共享依赖(react-native-webview、react-native-reusables 等,版本对齐 frontend)。

**导航注入契约**(screens 不 import expo-router):
- `BacktestConfigScreen`: props `{ onSubmit: (runId: string) => void }`(metas 数据流在屏内,行为同现页面)
- `BacktestResultScreen`: props `{ runId: string; onBack: () => void }`
- `RunHistoryScreen`: props `{ onOpenRun: (runId: string) => void }`

**desktop 导航状态机**:`type DesktopRoute = { name: "config" } | { name: "history" } | { name: "result"; runId: string }`;侧栏切换 config/history,`onOpenRun`/`onSubmit` 推 result;TDD 覆盖状态转移。

## 4. 设计系统:琥珀行情终端

### 4.1 Token(global.css @theme,深色固定)

| Token | 值 | 用途 |
|---|---|---|
| `color-base-950` | `#0B0A08` | 全局底(碳黑微暖) |
| `color-base-900` | `#14110D` | 面板 |
| `color-base-800` | `#1E1913` | 卡片/浮起 |
| `color-line` | `#2C251B` | 描边/分隔 |
| `color-text-primary` | `#EDE4D3` | 主文字(暖白) |
| `color-text-secondary` | `#9A8E78` | 次级文字(对 base-900 ≥4.5:1) |
| `color-accent` | `#F2A33C` | 琥珀(交互/焦点/active,对底 ≈8.9:1) |
| `color-accent-dim` | `#F2A33C22` | 选中底/弱化琥珀 |
| `color-up` | `#E5484D` | 涨(红,国内约定;UI 指标着色用) |
| `color-down` | `#3DD68C` | 跌(绿) |

对比度硬指标:正文/次级文字对各自底色 ≥4.5:1,accent 交互态 ≥4.5:1,均已在选值时校验。

### 4.2 字体与密度

- 正文:系统栈(RN 默认);**数字/价格/股数/日期/run id 一律 mono 栈**(SF Mono/Menlo/monospace,`fontFamily` 常量导出),是设计数字气质的载体
- 尺距:4 单位;数据密集布局,紧凑 padding,小标题大信息量

### 4.3 Signature:终端状态行(StatusLine)

每屏底部一条 mono 状态栏:左「VND-DEMO」+ 后端连通状态点(启动时 healthz 探测一次,失败可点重试);右侧上下文信息——配置页「8 FORMS · AAPL」、结果页「RUN <id> · <n> TRADES」、历史页「<n> RUNS」。桌面壳为全局一条;内容全部来自页面已有数据,不新增轮询。**这是唯一放大胆的元素,其余克制。**

### 4.4 组件集

- rnr 轻量集(复制进 `src/ui/`):Button / Input / Label / Card / Separator / Text(variants)
- 自研:`Segmented`(2-3 选项分段选择,策略类型/信号源/卖出比例预设)、`StatusLine`、`MetricCards`/`TradeList` 重设计体(等宽数据行)
- 明确不用:rnr Select/Dialog 等重组件(依赖 reanimated 面),避免依赖膨胀

## 5. 图表主题边界

- **只动**:图表背景、文字、网格线颜色 → 对齐 token(改 `chart-init-script.ts` 的 html 脚本常量与 `CHART_COLORS` 导出)
- **不动**:成交 marker(买绿 #26a69a / 卖红 #ef5350)与 MACD 柱红涨绿跌配色——与 UI 的 up/down token 属不同语义层,且现有测试锁定;保持零回退

## 6. 测试策略(TDD 铁律)

- 每个新组件/状态机:渲染 + 交互 + 边界(禁用态、空数据、失败态)测试先行,RED→GREEN
- S2 screens 抽取为行为不变重构:现有页面测试(12 个)**迁移到 screens 层复用**,断言语义零回退;Expo 页面薄壳仅补路由接线测试
- uniwind/jest 兼容性属 S0 spike 验证项:className 组件需在 jest-expo 下可渲染断言;若需 jest 配置则落 jest.setup
- desktop 导航状态机:纯 reducer 函数 TDD(不依赖原生渲染);集成以 `run-macos` 构建 + 手动冒烟为准
- 全绿口径:backend `uv run pytest`(111,不动)、frontend `npm test` + `npx tsc --noEmit`、`CI=1 npx expo export -p web`

## 7. 实施切片(分支 `feat/desktop-rn-macos`,每切片全绿即 commit+push)

| 切片 | 内容 | 完成判据 |
|---|---|---|
| S0 spike | ① frontend + uniwind 最小渲染(jest + tsc + web export);② desktop RN-macOS 0.83 init + `run-macos` + webview 图表冒烟;③ rnr CLI 组件落地路径 | 结论落 findings;任一环不可行即回报调整方案 |
| S1 | token(global.css + fontFamily 常量)+ ui 基础件(Button/Input/Label/Card/Separator/Text/Segmented/StatusLine) | 组件测试全绿 |
| S2 | screens 抽取(三页页面体迁 `src/screens/`,app/ 变薄壳) | 现测试迁移全绿,行为零回退 |
| S3 | 三页 + 组件 className 重设计 + 状态行 + 图表主题对齐 | 视觉验收点(用户可跑)+ 测试全绿 |
| S4 | desktop 壳:导航状态机 TDD + screens 集成 + uniwind @source + 图表 | `run-macos` 构建成功,三屏可用 |
| S5 | Electron 移除(desktop/ 旧文件、scripts、ELECTRON_RUN_AS_NODE 相关)+ README/CLAUDE.md/docker README 同步 + 全绿终检 | 验收清单全勾 |

风险与缓解(延续调研结论):uniwind×SDK 58 官宣止步 57(peer 满足)与 uniwind jest 配置未知 → S0 最先验证;react-native-webview×macos 0.83 → S0 冒烟;macOS 构建依赖 Xcode/pod(本机 darwin);RN 0.83 vs 0.88 共享面差异 → 只用核心组件面(S0 再次确认)。

## 8. 验收清单

- [ ] frontend jest 全绿(≥114 基线,语义零回退)+ `tsc --noEmit` 干净
- [ ] `CI=1 npx expo export -p web` 通过(5 路由)
- [ ] desktop `npx react-native run-macos` 构建成功;配置→回测→结果(图表/指标/成交)→历史全功能
- [ ] Electron 全部痕迹清除(desktop/ 旧文件、package.json scripts、文档引用)
- [ ] README(根/frontend/docker)与 CLAUDE.md 目录树、常用命令同步
- [ ] backend 测试不动(111 全绿)
