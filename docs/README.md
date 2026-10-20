# 文档导航

vn-demo 全部设计与研究文档索引。推荐阅读顺序:**本页 → spec → research(按需)→ plans(实施对照)**。

## 设计 spec(单一事实来源)

| 文档 | 内容 |
|---|---|
| [superpowers/specs/2026-10-20-vnpy-backtest-demo-design.md](superpowers/specs/2026-10-20-vnpy-backtest-demo-design.md) | 设计 spec:§1 需求范围、§4 数据层、§5 策略 8 形态、§6 引擎与曲线、§7 指标、§8 API、§10 错误处理、§11 测试策略与验收标准、§12 Docker、§13 里程碑 |

## 研究文档(先于 spec 产出,为 spec 提供依据)

| 文档 | 内容 | 何时读 |
|---|---|---|
| [research/2026-10-20-vnpy-deep-research.md](research/2026-10-20-vnpy-deep-research.md) | **汇总报告**(12 章):代码级尽调 × Web 调研双轨交叉结论、适配结论与六项落地清单 | 了解整体技术决策为什么这么做 |
| [research/vnpy-code-findings.md](research/vnpy-code-findings.md) | vnpy 4.5.0 / vnpy_ctastrategy 1.5.0 源码级尽调:无 GUI 回测可行、DAILY 支持、history_data 直注、撮合时序(t+1 开盘)、现金自管、ta-lib 硬依赖 | 改引擎封装/策略实现前 |
| [research/vnpy-web-findings.md](research/vnpy-web-findings.md) | Web 调研:yfinance 坑位清单(auto_adjust/end 独占/限流/复权回溯)、^GSPC vs SPY 基准、4.x 生态现状、标注约定(事实/观点/低置信) | 改数据层/基准选择前 |

## 实施计划(planning-with-files 执行台账)

| 文档 | 范围 | 状态 |
|---|---|---|
| [superpowers/plans/2026-10-20-backend-backtest-core.md](superpowers/plans/2026-10-20-backend-backtest-core.md) | Plan 1:后端 M1-M4(数据层/引擎/策略×8/指标/API/落库),Task 0-19 + 终审修复波 | ✅ 完成(105 tests) |
| [superpowers/plans/2026-10-20-frontend-charts.md](superpowers/plans/2026-10-20-frontend-charts.md) | Plan 2:前端 M5(Expo + TradingView 三页),Task F0-F7 + 终审修复波 | ✅ 完成(109 tests) |
| [superpowers/plans/2026-10-20-docker-acceptance.md](superpowers/plans/2026-10-20-docker-acceptance.md) | Plan 3:Docker D0-D3(双镜像/compose/验收收尾,M6) | ✅ 完成(D0-D3 全落地) |

## 其他

- `docs/回测指标.tmp`:指标需求原始清单(8 项的出处)
- 仓库根:`CLAUDE.md`(项目规范)、`task_plan.md` / `findings.md` / `progress.md`(planning-with-files 三件套)、`docker/README.md`(Docker 构建运行指南)
- `.superpowers/sdd/`(git-ignored):SDD 执行台账与子任务 brief/report
