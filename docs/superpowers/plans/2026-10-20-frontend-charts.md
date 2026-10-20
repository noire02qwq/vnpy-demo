# 前端实施计划(M5:Expo + TradingView Charts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expo React Native 前端(iOS/Android/Web 一套代码):回测配置页(动态表单)→ 结果页(指标卡片 + TradingView 可交互 K 线/EMA/MACD/KDJ + 三线对比 + 成交标注)→ 历史页;Electron 桌面壳;jest 全绿。

**Architecture:** 纯函数优先——API 类型/错误映射、图表数据映射、图表 HTML 生成器全部为可测纯函数;组件层薄。图表双平台:web 直挂 lightweight-charts,native 用 WebView 注入同一 HTML 生成器的产物(三端视觉一致)。

**Tech Stack:** Expo SDK 58(default-typescript 模板,expo-router)|TypeScript strict|lightweight-charts 5.2.1(web npm 包 + standalone CDN 给 WebView)|react-native-webview|jest-expo + @testing-library/react-native|Electron(桌面壳)。

**配套 spec:** `docs/superpowers/specs/2026-10-20-vnpy-backtest-demo-design.md` §8(API 契约)§9(前端规格)
**后端现状(已终审放行)**:`http://localhost:8000/api/v1`,CORS 已开;`frontend/src/api/schema.json` 为 openapi 副本(响应体无字段级 schema → API 类型手写)。
**后续计划:** Plan 3(Docker + 端到端验收 M6)在本计划完成后编写。

## Global Constraints

- 一切命令在 `frontend/` 目录;包管理用 npm(Node 26.8.1 已装)
- TypeScript `strict: true`;API 类型手写(与后端 spec §8 逐字段一致),禁止 any
- 图表数据映射/HTML 生成器/API 错误映射必须是纯函数且有单测;组件测试只做 smoke(jsdom 无 canvas,不测图表渲染本体)
- commit 中文 conventional + footer `Co-Authored-By: Claude Code <noreply@anthropic.com>`;每任务全绿才提交,控制器 push
- 内省自适应规则:Expo 58 / lightweight-charts v5 的实际 API 与本计划片段有出入时(尤其 v5 的 `chart.addSeries(CandlestickSeries, ...)` 系列式 API),**保持任务 Interfaces 契约不变调整内部**,记录差异到 findings.md
- 样式朴素统一(深色顶栏 + 白底卡片即可),不引入 UI 组件库(YAGNI)

---

### Task F0:Expo 工程骨架

**Files:** Create: `frontend/`(Expo 工程)、`frontend/src/`(空目录占位 `.gitkeep`)
**Interfaces:** Produces:`npm test`(jest 空跑 1 个 smoke)、`npx expo export -p web` 可出 `dist/`、`tsc --noEmit` 通过。

- [ ] **Step 1:脚手架** — repo root 执行 `npx --yes create-expo-app@latest frontend --template default-typescript --no-install`,然后 `cd frontend && npm install`(允许网络;若 default 模板结构变化,以 expo-router + typescript 可用为准)。删除模板示例屏 `app/(tabs)/` 内容,保留最小结构:

`frontend/app/_layout.tsx`:
```tsx
import { Stack } from "expo-router";

export default function Layout() {
  return <Stack screenOptions={{ headerTitleStyle: { fontWeight: "bold" } }} />;
}
```

`frontend/app/index.tsx`:
```tsx
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View style={{ padding: 16 }}>
      <Text>vn-demo 回测</Text>
    </View>
  );
}
```

- [ ] **Step 2:jest** — `npm i -D jest jest-expo @testing-library/react-native @types/jest`并配置 `package.json`:

```json
{
  "scripts": { "test": "jest" },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lightweight-charts)"
    ]
  }
}
```

`frontend/__tests__/smoke.test.ts`:
```ts
describe("smoke", () => {
  it("jest works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3:验证** — `npm test` → 1 passed;`npx tsc --noEmit` → 0 错误;`npx expo export -p web` → `dist/` 生成(耗时允许)
- [ ] **Step 4:Commit** — `git add frontend && git commit -m "feat(frontend): Expo 工程骨架(jest/web/router)"`(footer 同全局约束)

### Task F1:API 类型与客户端

**Files:** Create: `src/api/types.ts`、`src/api/client.ts`;Test: `__tests__/api.test.ts`
**Interfaces:** Produces:
- types:`StrategyMeta{type,kind,signal:SignalKind|null,mode,defaults:Record<string,number|boolean|string>,schema:Record<string,{type:"number"|"integer"|"boolean"|"string",enum?:string[],minimum?:number}>}`、`StrategySpec`、`CostConfig`、`BacktestRequest`、`Trade`、`BacktestResult{id,request,metrics:Record<string,number>,curves:{dates:string[],equity:number[],position_value:number[],benchmark:number[]},candles:{dates,open,high,low,close,volume:number[],overlays:{ema_fast?:number[],ema_slow?:number[]},sub:{macd?:{dif,dea,hist:number[]},kdj?:{k,d,j:number[]}}},trades:Trade[]}`、`RunSummary{id,created_at,request,metrics}`、`ErrorCode` 联合类型
- `API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000"`
- `getStrategies(): Promise<StrategyMeta[]>`;`fetchData(symbol,start,end): Promise<{symbol,rows,first_date,last_date,cache_hit}>`;`runBacktest(req: BacktestRequest): Promise<BacktestResult>`;`listRuns(page,pageSize): Promise<{items:RunSummary[],total:number}>`;`getRun(id): Promise<BacktestResult>`;`deleteRun(id): Promise<void>`
- `errorMessage(code: string | undefined, fallback?: string): string`(错误码→中文映射表:INVALID_SYMBOL 无效标的代码 / NO_DATA 区间内无数据 / RANGE_TOO_SHORT 区间过短,暖机不足 / RATE_LIMITED 雅虎接口限流,请稍后重试 / BAD_PARAMS 参数错误 / RUN_NOT_FOUND 回测记录不存在 / INTERNAL 服务器内部错误;未知码回退 fallback ?? "请求失败")
- `ApiError extends Error { code?: string }`(client 捕获非 2xx 解析 `{code,message}` 抛出)

- [ ] **Step 1:失败测试** `__tests__/api.test.ts`:mock global.fetch;①runBacktest 组装正确 URL/方法/body;②非 2xx `{code:"RATE_LIMITED"}` → ApiError.code=="RATE_LIMITED";③errorMessage 全码映射 + 未知码回退;④deleteRun 204 不解析 body
- [ ] **Step 2:RED** `npm test` → fail(模块不存在)
- [ ] **Step 3:实现** types.ts + client.ts(手写类型;fetch 包装 `request<T>(path, init?)` 统一解析/抛错)
- [ ] **Step 4:GREEN** 全部通过;`npx tsc --noEmit` 干净
- [ ] **Step 5:Commit** `feat(frontend): API 类型与客户端(错误码中文映射)`

### Task F2:图表数据映射(纯函数)

**Files:** Create: `src/charts/chart-data.ts`;Test: `__tests__/chart-data.test.ts`
**Interfaces:** Produces:
- `toCandles(result: BacktestResult): { time: string; open: number; high: number; low: number; close: number }[]`(time=YYYY-MM-DD)
- `toLine(times: string[], values: number[]): { time: string; value: number }[]`(values[i] 对应 times[i];长度不齐截短到 min)
- `toMarkers(trades: Trade[]): { time: string; position: "aboveBar"|"belowBar"; color: string; shape: "arrowDown"|"arrowUp"; text: string }[]`(buy→belowBar/arrowUp/绿 "B";sell→aboveBar/arrowDown/红 "S")
- `toHistogramMacd(sub: {dif:number[],dea:number[],hist:number[]}, times: string[]): { time: string; value: number; color: string }[]`(hist≥0 红 `#ef5350`,<0 绿 `#26a69a`——国内约定红涨绿跌)
- `buildChartPayload(result: BacktestResult): object`(把 candles/overlays/sub/三线序列打包为一个可 JSON 序列化的对象——WebView HTML 注入用)
- `buildChartHtml(payload: object): string`(完整 HTML 文档字符串:内嵌 `<script src="https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js"></script>` + `const PAYLOAD = <json>;` + 初始化脚本占位;`JSON.stringify(payload).replace(/</g, "\\u003c")` 防 `</script>` 逃逸)

- [ ] **Step 1:失败测试**:构造 3 根 bar 的迷你 BacktestResult fixture,逐函数断言(含长度不齐截短、marker 方向/颜色、hist 颜色分界、HTML 含转义后 payload 且不含裸 `</script>`)
- [ ] **Step 2:RED → Step 3:实现 → Step 4:GREEN + tsc 干净**
- [ ] **Step 5:Commit** `feat(frontend): 图表数据映射与 WebView HTML 生成器`

### Task F3:LightChart 双平台组件

**Files:** Create: `src/charts/LightChart.tsx`、`src/charts/LightChart.web.tsx`、`src/charts/LightChart.native.tsx`、`src/charts/ThreeLineChart.tsx`(web/native 同构:内部用 Platform.select 复用 LightChart 的 line-series 模式或独立实现,以最简为准)
**Interfaces:** Produces:
- `LightChart` props:`{ kind: "candles" | "macd" | "kdj"; result: BacktestResult }`(candles:K线+EMA 叠加+markers;macd:hist 柱+dif/dea 线;kdj:k/d/j 三线;各自高度 macd/kdj 200、candles 360)
- `ThreeLineChart` props:`{ result: BacktestResult }`(三线:总资金/持仓资金/S&P500,图例文字标签,高度 260)
- web 实装:`useEffect` 里 `createChart(el, {...})` + v5 API `chart.addSeries(CandlestickSeries, ...)` 等(lightweight-charts 已在 F0 安装:`npm i lightweight-charts`);unmount 时 `chart.remove()`
- native 实装:`react-native-webview`(`npm i react-native-webview`)+ `source={{ html: buildChartHtml(buildChartPayload(result)) }}`(`javaScriptEnabled`)。HTML 初始化脚本按 kind 渲染对应 series(web/native 渲染逻辑等价,web 端直接用 npm 包)
- **初始化脚本逻辑抽为 `src/charts/chart-init-script.ts` 纯函数 `(kind) => string`**(操作全局 PAYLOAD),web/webview 共用同一份字符串 → 三端一致可测

- [ ] **Step 1:`chart-init-script.ts` 的单测**:三种 kind 的脚本包含各自 series 关键字(candlestick/ema_fast;hist/dif/dea;k/d/j)
- [ ] **Step 2:实现三平台组件 + tsc 干净**(组件本体不做 jsdom 渲染测试;`__tests__/charts-smoke.test.ts` 仅断言模块可导入 + web 组件在 Platform.OS==="web" 下导出非空)
- [ ] **Step 3:手动冒烟记录到报告**:`npx expo start --web` 起后(后端同步起)访问配置页——本任务先只要求组件编译通过,真机/浏览器冒烟在 F7/F8 集成后统一做
- [ ] **Step 4:Commit** `feat(frontend): LightChart 双平台组件(web 直挂 / WebView 同源 HTML)`

### Task F4:策略动态表单组件

**Files:** Create: `src/components/StrategyForm.tsx`;Test: `__tests__/strategy-form.test.ts`
**Interfaces:** Produces:`StrategyForm` props:`{ metas: StrategyMeta[]; onSubmit: (req: BacktestRequest) => void; submitting?: boolean }`;内部 state:symbol/start/end/initial_capital/strategy type 选择/params(由选中 meta 的 schema+defaults 驱动)/entry_pct/entry_basis(仅 signal 形态显示)/benchmark_symbol(默认 ^GSPC,可空)/cost 三项(默认 0.001/0.01)/warmup_bars(默认 100)。
- 校验(提交前,镜像后端):symbol 非空且大写;start/end 均为合法 YYYY-MM-DD 且 start<end;initial_capital>0;signal 形态 entry_pct∈(0,100];tpsl 形态 take_profit_pct/stop_loss_pct>0(来自 params)。校验失败置 `error` state 显示中文,不调 onSubmit。
- 渲染规则:schema.enum → Picker;boolean → Switch;integer/number → TextInput(keyboard-type numeric,值为 string state,提交时 Number())
- `validateForm(state): string | null` **抽为纯函数导出**(测重点)

- [ ] **Step 1:`validateForm` 纯函数测试**(合法/symbol 小写/start≥end/资金 0/entry_pct 0 与 101/tpsl tp=-1 → 各得中文错误;全合法 → null)
- [ ] **Step 2:实现组件 + 组件 smoke 测试**(render 出 symbol 输入框 + 策略选择器)
- [ ] **Step 3:GREEN + tsc → Commit** `feat(frontend): 策略动态表单(meta schema 驱动)`

### Task F5:配置页 + 结果页 + 历史页

**Files:** Modify: `app/index.tsx`(配置页实装);Create: `app/result/[id].tsx`、`app/history.tsx`、`src/components/MetricCards.tsx`、`src/components/TradeList.tsx`;Test: `__tests__/pages.test.tsx`(mock src/api)
**Interfaces:**
- 配置页:`useEffect` 拉 getStrategies(失败 Alert errorMessage);渲染 StrategyForm;onSubmit→runBacktest→`router.push("/result/" + id)`(异常 Alert errorMessage(e))
- 结果页:`useLocalSearchParams<{id}>`→getRun;顶部横滚指标卡片(MetricCards:中文标签映射表 TOTAL_RETURN 总收益率/ANNUAL_RETURN 年化收益率/ALPHA Alpha/BETA Beta/MAX_DRAWDOWN 最大回撤/ANNUAL_VOLATILITY 年化波动率/SHARPE 夏普比率/INFORMATION_RATIO 信息比率/TOTAL_TRADE_COUNT 交易次数/TOTAL_COMMISSION 总佣金/RETURN_DRAWDOWN_RATIO 收益回撤比;数值 format:百分率类 ×100 保留 2 位 + "%",比率类保留 3 位,null→"—");两个区块:K线区(LightChart kind=candles)+ 副图区(macd/kdj 按存在性渲染)+ ThreeLineChart + TradeList(时间/方向/价格/数量);DELETE 按钮此处不放(历史页管)
- 历史页:listRuns(1,20) FlatList(标的/形态/创建时间/总收益率%)+ 点击跳结果页 + 长按或按钮 deleteRun 后刷新;空态文案「暂无回测记录」
- 页面测试:mock api 模块,断言配置页渲染表单、结果页渲染指标卡文案、历史页渲染行

- [ ] **Step 1:页面测试先写(mock api)→ RED**
- [ ] **Step 2:实现三页 + 两组件 → GREEN**
- [ ] **Step 3:`npx tsc --noEmit` + 全量 `npm test` → Commit** `feat(frontend): 配置/结果/历史三页(指标卡片+图表+成交)`

### Task F6:Electron 桌面壳

**Files:** Create: `desktop/main.js`、`desktop/README.md`;Modify: `frontend/package.json`(scripts + devDependency electron)
**Interfaces:** `npm run desktop` 启动 Electron 窗口加载 `process.env.DESKTOP_URL ?? "http://localhost:8081"`(expo web dev server);`npm run desktop:dist` 加载静态 `dist/index.html`(file://)。

`desktop/main.js`:
```js
const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, title: "vn-demo 回测" });
  const target = process.env.DESKTOP_URL ?? "http://localhost:8081";
  if (target.startsWith("http")) win.loadURL(target);
  else win.loadFile(target);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
```

- [ ] **Step 1:frontend devDependencies 加 `electron`(`npm i -D electron`,下载二进制允许)**;scripts:`"desktop": "electron ../desktop/main.js"`、`"desktop:dist": "cross-env DESKTOP_URL=../dist/index.html electron ../desktop/main.js"`(若无 cross-env 用 env 内联或两段脚本,以实际为准并记录)
- [ ] **Step 2:验证**:`npx expo export -p web` 后 `DESKTOP_URL=<repo>/frontend/dist/index.html npx electron desktop/main.js` 能开窗加载(手动冒烟,记录到报告;CI/无头环境可跳过,以 `node -e "require('./desktop/main.js')"` 不抛语法错兜底)
- [ ] **Step 3:Commit** `feat(frontend): Electron 桌面壳(dev/dist 两模式)`

### Task F7:收尾——集成冒烟 + README + 全绿

**Files:** Modify: 根 `README.md`(M5 行为 ✅、快速开始补前端三行)、`frontend/README.md`(若模板生成则改写为中文:安装/测试/web/桌面)
**Interfaces:** Produces:前端全绿可交付状态。

- [ ] **Step 1:集成冒烟(手动,记录到 progress.md)**:起后端(`uv run uvicorn app.main:app`)+ `npx expo start --web` → 浏览器完成一次真实回测(AAPL 近 1 年,ema_cross 默认参数)→ 结果页图表/指标/成交可见 → 历史页可见记录。若 yfinance 限流,改用缓存或换标的,记录现象
- [ ] **Step 2:`npm test` 全绿 + `npx tsc --noEmit` 干净**
- [ ] **Step 3:README 更新** + Commit `feat(frontend): M5 收尾(集成冒烟与文档)` + push

---

## Self-Review 记录

- spec §9 覆盖:三页/动态表单/api 类型化/双平台图表/三线对比/markers/Electron → F1-F6 ✓;§8 契约消费 → F1 手写类型 ✓
- 已知取舍:lightweight-charts 多副图用独立 chart 实例堆叠(不用 v5 panes API,降低不确定性);WebView 用一次性 HTML 注入(无 postMessage 往返);openapi 响应无字段 schema → API 类型手写自 spec §8
- 类型一致性:BacktestResult/candles/curves 与后端 service 输出键名逐一对照(max_drawdown 小数/max_drawdown_amount 美元均在 metrics Record)✓
