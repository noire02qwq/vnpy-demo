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

## vnpy 4.5.0 内省(Task 0, 2026-10-20)
- **版本修正**:`vnpy-ctastrategy==1.5.0` 未发布到 PyPI(PyPI 最新 1.4.1;1.5.0 仅是 GitHub tag)。实装 **1.4.1**;与 1.5.0 的 backtesting.py diff 仅为 docstring/局部变量类型标注,**无 API 行为差异**,尽调结论仍适用
- `set_parameters`: `(self, vt_symbol: str, interval: Interval, start: datetime, rate: float, slippage: float, size: float, pricetick: float, capital: int = 0, end: datetime | None = None, mode: BacktestingMode = BAR, risk_free: float = 0, annual_days: int = 240, half_life: int = 120) -> None`
  - **无 `fixed` 参数** → 后续 runner 用 rate-only(成本模型退化为比率佣金)
  - `rate/slippage/size/pricetick` 为必填且在可选 `end` 之前(与尽调记录的参数顺序一致)
  - **存在 `risk_free`** → 夏普/信息比率可直接用,不必自算无风险利率
- `add_strategy`: `(self, strategy_class: type[CtaTemplate], setting: dict) -> None`;`get_all_trades` 存在
- backtesting.py 路径: `.venv/lib/python3.12/site-packages/vnpy_ctastrategy/backtesting.py`
- 实测安装:ta-lib C 库 brew 0.8.1 + Python `ta-lib==0.8.2`(PyPI 无 0.6.4 macOS wheel,0.8.x 可用);yfinance 实装 **1.7.0**(非 0.2.x,API 需按新版校验);sqlalchemy 2.1.5
- 冒烟:`uv run pytest -q` → 2 passed(1 个无害告警:starlette testclient 提示 httpx2)

## 环境大版本风险(Task 0 评审补充,2026-10-20)
- 锁定结果含大版本跳级:pandas **3.0.6**、numpy 2.5.4、pytest 9.1.1、sqlalchemy 2.1.5、fastapi 0.150。pandas 3.0 的 CoW/字符串 dtype 变化对数据层(校验/缓存/BarData 转换)影响最大,相关任务以「测试先行+实际行为为准」处理,勿照抄 pandas 2 时代姿势。

## yfinance 1.7.0 API(Task 5, 2026-10-20 内省)
- `yf.download` 在 1.7.0 仍存在,签名:
  `(tickers, start=None, end=None, actions=False, threads=True, ignore_tz=None, group_by='column', auto_adjust=True, back_adjust=False, repair=False, keepna=False, progress=True, period='1mo if start & end None', interval='1d', prepost=False, rounding=False, timeout=10, session=None, multi_level_index=True) -> Optional[pandas.DataFrame]`
- **brief 的 `default_downloader` 片段在 1.7.0 下几乎原样可用**:`auto_adjust` 仍在(且 1.7.0 默认即 True,显式传 True 与 0.2.x 语义一致=复权 OHLC);`progress` 仍在(传 False 静默);`start/end` 语义不变(end 不含当天,故仍需 `end+1天`)
- **1.7.0 新增 `multi_level_index=True`(默认)**:单标的也返回 MultiIndex 列(Price, Ticker),与 0.2.x 后期行为一致 → 保留 brief 的 `isinstance(df.columns, pd.MultiIndex)` 取第一层 guard 即可,无需显式传该参数(guard 两种情况都兜住)
- 返回类型 `Optional[DataFrame]`(1.7.0 显式标注可能返回 None)→ `fetch_daily` 的 `df is None or df.empty` 空值双保险是必要的
- 实现偏离 brief 之处:仅将 `fetch_daily` 内部的 `from app.core.errors import ...` 提升到模块顶部(任务允许);其余按 brief 原样。测试仍注入假 downloader,零联网、不依赖 yfinance 内部
- **brief 自相矛盾两处(实测发现,已修正并记录)**:
  1. `test_multiindex_flattened_and_validated` 注入返回 MultiIndex 列的假 downloader,但 brief 实现只在 `default_downloader` 里拍平(测试已绕过它)→ 校验层看到 tuple 列直接报「缺列」。修正:抽 `_flatten_columns` helper,`fetch_daily` 在 validate 前也拍平(`default_downloader` 契约不变)
  2. 同一测试 `warmup_bars=10` 只有 15 行,而 Task 3 已上线的 validate 硬闸门要求 `warmup_bars+10`=20 行,brief 原样必失败。修正:测试改 `warmup_bars=5`(15≥15,意图不变:拍平+全链路校验通过),validate.py 一字未动

## vnpy 回测驱动(Task 7)
- **直注路径成立,无需 B 方案**:`run_backtesting`(1.4.1 backtesting.py:216-249)只遍历 `history_data`,不调 `load_data`、不读 `self.days`(`self.days` 仅在 __init__ 初始化,回测链路零引用)→ `engine.history_data = list(bars)` 直注后直接 run_backtesting 即可,monkeypatch `load_bar_data` 的 fallback 未触发
- **brief 测试代码 bug:`TradeData` 无 `time` 字段**(vnpy/trader/object.py:154-175,只有 `datetime`;`self.time` 在 object.py:229 属于 LogData)→ `trade.time.date()` 必抛 AttributeError;改为 `trade.datetime.date()`,行为意图不变(成交日期 = 触发 bar 的下一根)
- **t+1 成交语义实测确认**:触发 bar idx 6(close 106>105,委托价 111.3)→ 成交 datetime = bars[7] 2023-01-09 00:00,price = min(111.3, 次日开盘 106.0) = 106.0,volume 1,`strategy.pos`=1;new_bar 顺序 = 先 cross 后 on_bar(backtesting.py:649-656),与尽调结论一致
- 日 K datetime 为 00:00,成交 datetime 直接取 bar.datetime,同日比较无时区/时刻噪声,无需归一化
- `set_parameters` 的 `fixed` 守卫生效:1.4.1 无该参数,kwargs 不含 fixed,成本模型为 rate+slippage;`calculate_statistics` 返回 28 键,`total_trade_count` 为 np.int64(与 int 比较成立)
- 引擎 `output` 在 calculate_statistics 开头无条件打印一行(仅内部逐项受 output=False 控制),FastAPI 侧接入时日志噪声可接受
- ruff 0.17.1 默认规则集比 0.8 宽(触发 I001/C408/RUF012):runner 的 kwargs 改 dict 字面量、import 排序;测试策略的 `parameters/variables` 按 CtaTemplate 惯例必须为类属性,用 `ClassVar[list]` 注解满足 RUF012,不改 vnpy 语义
