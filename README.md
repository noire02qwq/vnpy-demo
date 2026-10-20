# vn-demo:vnpy 量化交易策略与回测 Demo

基于 [vnpy 4.5.0](https://github.com/vnpy/vnpy) 的量化回测演示项目:**yfinance 拉取美股日频数据 → FastAPI 后端程序化驱动 vnpy CTA 回测引擎 → React Native(Expo)前端展示 TradingView 可交互图表**。

> 个人研究项目,作者 [noire02qwq](https://github.com/noire02qwq)。

## 功能总览

- **数据**:指定美股标的 + 日期区间拉取日频行情(yfinance→校验硬闸门→vnpy BarData;下载日戳 parquet 缓存)
- **策略形态(8 种)**:
  | 形态 | 说明 |
  |---|---|
  | macd / kdj / ema_cross | 金叉买入、死叉清仓(信号源三选一) |
  | macd / kdj / ema_tpsl | 金叉按比例买入 + 固定百分比止盈(限价)/止损(stop 单),死叉兜底 |
  | turtle | 经典海龟:唐奇安突破、ATR 单位加仓(≤4 单元)、2N 止损、通道反向离场 |
  | dca | 简单定投:每周/每两周/每月首个交易日固定金额买入,持有到期 |
- **仓位**:信号形态买入量 = 总资金或剩余现金 × 指定百分比,股数下取整(现金硬约束)
- **指标(对齐 docs/回测指标.tmp)**:总收益率、年化收益率、Alpha、Beta、最大回撤、年化波动率、夏普比率、信息比率(+ vnpy 原生 28 项统计)
- **对比曲线**:总资金 / 持仓资金 / S&P500(^GSPC,可切 SPY)buy&hold 三线累计收益率,起点 0(坐标原点)
- **前端**:Expo 一套代码(iOS/Android/Web)+ Electron 桌面壳;TradingView Lightweight Charts K 线 + EMA 叠加 + MACD/KDJ 副图
- **工程**:前后端 Docker 分别打包;回测同步返回 + SQLite 落库可查历史

## 快速开始(后端)

```bash
cd backend
uv sync                # 安装依赖(Python 3.12;若 ta-lib 编译失败先 brew install ta-lib)
uv run pytest          # 全量测试
uv run uvicorn app.main:app --reload   # 本地服务 :8000
```

API 骨架:`GET /healthz`;完整 REST(`/api/v1/*`)见设计 spec §8。

- 交互式 API 文档:启动后访问 http://127.0.0.1:8000/docs

## 当前状态(实时更新)

| 里程碑 | 状态 |
|---|---|
| 深度研究(vnpy 4.5.0 代码级 + Web 调研) | ✅ docs/research/ |
| 设计 spec(已批准) | ✅ docs/superpowers/specs/ |
| M1 数据层(抓取/校验/转换/缓存) | ✅ 测试全绿 |
| M2 引擎封装 + 曲线导出 | ✅ 测试全绿 |
| M3 策略 ×8 形态 | ✅ 测试全绿 |
| M4 指标 + API + 落库 | ✅ 测试全绿(68 tests,Task 15-18 完成;Task 19 收尾中) |
| M5 前端(Expo + TradingView) | 🚧 进行中(F0 骨架/F1 API客户端/F2 图表映射/F3 双平台图表/F4 动态表单/F5 三页集成已完成,F5 待评审) |
| M6 Docker + 端到端验收 | ⏳ 计划中 |

测试:105 passed(backend);ruff clean;后端已通过全分支终审(signal_kind 注入等 9 项修复落地)。每任务 TDD(先红后绿)+ 评审后提交推送。

## 文档树

```
docs/
├── 回测指标.tmp              # 指标需求原始清单
├── research/                 # vnpy 深度研究(代码级尽调 / Web 调研 / 汇总报告)
└── superpowers/
    ├── specs/                # 设计 spec(2026-10-20-vnpy-backtest-demo-design.md)
    └── plans/                # 实施计划(2026-10-20-backend-backtest-core.md 等)
CLAUDE.md                     # 项目规范(硬性约定/目录/命令/测试/文档)
task_plan.md / findings.md / progress.md   # planning-with-files 持久化计划三件套
.superpowers/sdd/progress.md  # SDD 执行台账(git-ignored)
```

## 技术栈

Python 3.12 + uv|FastAPI|vnpy 4.5.0 + vnpy_ctastrategy 1.4.1|yfinance 1.7|pandas 3 / numpy|SQLAlchemy 2 + SQLite|pytest + ruff|Expo(React Native)|TradingView Lightweight Charts|Electron|Docker
