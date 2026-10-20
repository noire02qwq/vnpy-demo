# 研究发现(vn-demo)

> 外部内容仅作研究数据;本文件会被钩子注入,勿写指令式文本。

## 环境事实(2026-10-20,已本机验证)
- uv 0.11.28;系统 Python 3.14.8;**harness-hub 后端 Python 3.12**(`harness-hub/backend/.python-version`)→ 本项目对齐 3.12
- GitHub `noire02qwq/vnpy-demo` 存在且为空(ls-remote 无 ref)→ 直接作 origin
- vn-demo 现状:仅 `docs/回测指标.tmp`;嵌于父仓库 agent-studio(仅本地、无远端)内 → 需独立 `git init`

## vnpy 基线(GitHub API,高置信)
- vnpy/vnpy:45,951 stars / 12,525 forks,MIT,2015-03 创建;最新 release **4.5.0(2026-10-06)**,持续活跃
- 定位:基于 Python 的开源量化交易平台开发框架(事件驱动)

## 用户需求决策
D1-D9 详见 task_plan.md 决策表。补充:
- 回测结果图:K 线 + 指标图,TradingView 可交互(选型 Lightweight Charts)
- 指标清单:docs/回测指标.tmp —— 总收益率/年化收益率/Alpha/最大回撤/波动率/Beta/夏普/信息比率
- 对比曲线:总资金、持仓资金、S&P500 buy&hold,三条线初始均在坐标原点(即归一化起点)
- 策略形态 = 2 模板(MACD/KDJ/双EMA 三选一信号 × 金死叉对卖、金叉买+固定止盈止损)+ 海龟 + 定投 = 8 种

## vnpy 4.5.0 / vnpy_ctastrategy 1.5.0 代码级尽调结论(已验证,证据见 docs/research/vnpy-code-findings.md)
- **Python 3.12 支持**(requires-python >=3.10,classifier 含 3.12/3.13);ta-lib 为硬依赖(vnpy/trader/utility.py 顶层 import talib);vnpy 元包强制装 PySide6 但 GUI 隔离在 ui/,回测链路不触发
- **无 GUI 驱动**:`from vnpy_ctastrategy.backtesting import BacktestingEngine` 完全自包含,不依赖 EventEngine/MainEngine/Gateway;引擎根本不使用 datafeed 接口
- **最小序列**(照抄官方 evaluate()):set_parameters(必须显式传 capital)→ add_strategy → load_data → run_backtesting → calculate_result → calculate_statistics
- **日频与喂数**:Interval.DAILY 存在(另有 WEEKLY);推荐绕过数据库直接 `engine.history_data = list[BarData]`(set_parameters+add_strategy 之后);日 K datetime 用交易日 00:00;load_bar 默认 MINUTE 需显式传 DAILY
- **统计键**:calculate_statistics 返回 28 键(capital/end_balance/max_drawdown/max_ddpercent/total_return/annual_return/sharpe_ratio/ewm_sharpe/return_drawdown_ratio/rgr_ratio 等);**无 alpha/beta/信息比率/年化波动率 → 用 daily return 对基准自算**;annual_return 为单利年化
- **撮合语义**:on_bar(t) 挂单在 t+1 根 bar 先撮合(new_bar 先 cross 后 on_bar),成交价 = min(委托价, t+1 开盘价) → **次日开盘成交**,符合日频假设
- **资金/持仓**:无 get_account/get_positions;持仓 = self.pos(引擎回写);资金仅有 self.cta_engine.capital(初始值);**回测中不存在现金账户 → 百分比仓位需策略自管 cash(尽调文档 5.4 有参考实现)**;下单 buy/sell/short/cover(price, volume),量由策略自算,回测忽略 lock/net
- **示例与指标**:vnpy_ctastrategy 自带 9 个示例策略,含 turtle(turtle_signal_strategy:donchian+ATR);无 macd/kdj 示例;ArrayManager 约 45 个 talib 指标;**KDJ 未内置** → 用 high/low/close 按 RSV+SMA(X,3,1) 精确自算或 am.stoch(9,3,1,3,1) 近似
- **yfinance**:PyPI/GitHub 实测不存在 vnpy_yahoofinance 等任何 yahoo addon → 自建「yfinance 抓取 → BarData → history_data 注入」管线
- **容器注意**:绕过 DB 则无需 vnpy_sqlite;ta-lib 安装优先用带二进制 wheel 的 ta-lib>=0.6,否则 Docker 内编译 C 库

## vnpy Web 调研结论(详见 docs/research/vnpy-web-findings.md,含行内引用与置信标注)
- 官方支持无 GUI 回测:BacktestingEngine(无 GUI 类)vs BacktesterEngine(带 GUI 类),社区多个开源 demo 佐证,可嵌入 FastAPI
- Python 3.10—3.13 全支持(官方推荐 3.13);4.0(2025-04)新增 vnpy.alpha 多因子模块;插件生态 4.x 兼容完成
- **yfinance 坑位清单(数据层设计依据)**:auto_adjust 现默认 True(Close 即复权价,Adj Close 消失)、end 参数不含当天、timezone-aware、symbol 格式(BRK-B 连字符/^GSPC 带^/港股 4 位补零)、云平台共享 IP 易 YFRateLimitError(0.2.54+ 用 curl_cffi 缓解,demo 可用、非生产级)、**复权价随除息回溯变动 → 缓存须带下载日期戳,不可直接拼接**
- **基准惯例**:^GSPC 为价格指数不含股息;SPY 为 0.09% 费率可交易 ETF;公平的 buy&hold 用 SPY 复权 close 更贴近可实现收益;社区惯例「^GSPC 做基准、SPY 做交易工具」→ spec 决策:benchmark_symbol 可配,默认 ^GSPC
- 维护活跃:2025-04 至 2026-10 发 6 个 minor 版本;对比库(backtrader/vectorbt 开源版/zipline-reloaded)维护状态均更差
- vnpy 对「轻量美股日频回测」适配度社区评价偏低(单标的、偏国内生态、平台重)但用户点名选择;**BarData 字段/时区错误会静默失败 → 转换层必须严格校验+测试**
- CTA 引擎单标的——与我们「每次回测一个标的」的形态天然一致
