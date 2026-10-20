# 任务计划:vnpy 量化交易策略与回测 Demo(vn-demo)

## 目标
基于 vnpy 4.5.0 构建量化回测 demo:yfinance 拉美股日频数据 → FastAPI 后端程序化驱动 vnpy CTA 回测引擎 → React Native(Expo,iOS/Android/Web + 桌面壳)前端展示。支持 8 种策略形态、百分比/ATR 仓位、8 项指标、S&P500 对比曲线、TradingView 可交互 K 线与指标图。终态:**功能全部支持、测试全绿**(/goal)。

## 关键决策
| # | 决策 | 日期 |
|---|---|---|
| D1 | Python 3.12,uv 管理(对齐 harness-hub 后端) | 2026-10-20 |
| D2 | 技术路线 A:FastAPI 程序化驱动 vnpy_ctastrategy BacktestingEngine(无 GUI、无 EventEngine) | 2026-10-20 |
| D3 | 前端 Expo 一套代码覆盖 iOS+Android+Web;桌面 = Web 产物套 Electron 壳;图表用 TradingView Lightweight Charts(K线+指标可交互) | 2026-10-20 |
| D4 | 信号源三选一(MACD / KDJ / 双指定 EMA),金叉买、死叉卖;EMA 快慢周期用户指定 | 2026-10-20 |
| D5 | 默认真实感成本:佣金 0.1%/笔 + 滑点 0.05%;佣金率/固定佣金/滑点全部可配 | 2026-10-20 |
| D6 | 海龟 = 经典 ATR 单位制;其余策略买入量 = 总资金或剩余现金的指定百分比,股数下取整 | 2026-10-20 |
| D7 | 定投 = 固定金额 + 间隔(每周/每两周/每月首个交易日),持有到期不清仓 | 2026-10-20 |
| D8 | 回测同步返回 + SQLite 落库,可查历史列表与详情 | 2026-10-20 |
| D9 | 远程仓库 https://github.com/noire02qwq/vnpy-demo.git(初始为空);实时提交推送;必要时拉分支集成 | 2026-10-20 |

## 阶段

### Phase 0:深度研究与规划基线 — Status: complete
- [x] 探索项目上下文(harness-hub Python 3.12;远端空仓库;vnpy 4.5.0 基线)
- [x] 澄清 6 个关键问题(平台/信号/成本/海龟/定投/持久化)
- [x] 方案比选与用户确认(方案 A)
- [x] vnpy 代码级尽调(docs/research/vnpy-code-findings.md)——无 GUI 可行、DAILY 支持、history_data 直注、现金自管
- [x] vnpy Web 调研(docs/research/vnpy-web-findings.md)——yfinance 坑位清单、^GSPC vs SPY 基准惯例、4.x 生态现状
- [x] 汇总深度研究报告 docs/research/2026-10-20-vnpy-deep-research.md(12 章;最高风险=数据静默失效,已设计校验硬闸门)

### Phase 1:仓库与规范 — Status: in_progress
- [x] git init + remote origin(SSH)+ 首次提交推送(9df9afc)
- [x] CLAUDE.md 规范文档(目录/命名/提交/测试/文档树约定)
- [ ] 工程骨架:backend(uv + Python 3.12)+ frontend(Expo)+ docker/ 编排

### Phase 2:设计 spec 与评审 — Status: complete
- [x] docs/superpowers/specs/2026-10-20-vnpy-backtest-demo-design.md
- [x] spec 自审修正:TP/SL 必须走 vnpy stop 单(防绕过引擎致曲线失真)、EXPO_PUBLIC_API_BASE、on_trade 校准 sizing 现金
- [x] 用户批准(2026-10-20「批准,自主推进到 goal」,授权免逐节评审)

### Phase 3:实施计划 — Status: complete
- [x] Plan 1 后端核心 docs/superpowers/plans/2026-10-20-backend-backtest-core.md(Task 0-19,含 TDD 步骤与完整代码)
- [ ] Plan 2 前端(M5)——Plan 1 完成后编写
- [ ] Plan 3 Docker+端到端验收(M6)——Plan 2 完成后编写

### Phase 4:TDD 实现(切片顺序以实施计划为准)— Status: in_progress
- [x] 数据层:yfinance → vnpy BarData(DAILY)转换 + 本地缓存 + 测试 fixture(Task 2-6,25 测试绿)
- [ ] 回测引擎封装:无 GUI 驱动、资金/持仓查询、equity 与持仓资金曲线导出
- [x] 策略:MACD / KDJ / 双EMA 金死叉 ×(金死叉对卖 | 金叉买+固定止盈止损)+ 海龟 + 定投(Task 10-13,registry 8 形态,51 测试绿)
- [ ] 指标:总收益/年化/Alpha/MDD/波动率/Beta/夏普/信息比率 + ^GSPC 基准对比曲线(初始归零)
- [ ] FastAPI API(拉数/回测/历史)+ SQLite 落库
- [ ] RN 前端:回测配置页 / 结果页(TradingView K线+指标+三线对比)/ 历史页
- [ ] Docker:backend 镜像 + frontend(web)镜像,可分别构建运行
- [ ] 文档树完善(docs/ 结构化)

### Phase 5:验收 — Status: pending
- [ ] 全部功能支持,backend + frontend 测试全绿
- [ ] 端到端 demo:真实拉数据 → 回测 → 图表渲染验证
- [ ] 最终提交推送

## 错误记录
| 错误 | 尝试 | 解决 |
|---|---|---|
| (暂无) | | |
