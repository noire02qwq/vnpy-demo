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

## 策略层(Task 10)

- **`Direction` 枚举值是中文串非整数**:`Direction.LONG.value == "多"`、`SHORT.value == "空"`(vnpy/trader/constant.py:10-15)→ brief 测试的 `t.direction.value == 1/2` 必错,改为直接比枚举 `t.direction == Direction.LONG/SHORT`
- **brief 数据形态 bug:V 形(先跌后涨)走不出死叉平仓**——涨段单调 EMA5/20 金叉后不再回落,后验 warmup 期唯一 cross 事件就是金叉(V 形 240 根实测:唯一 cross = idx 130 金叉,零卖出)→ `test_death_cross_exits_full` 在 V 形上恒失败;新增 `round_trip_closes`(跌70→涨90→跌80)使金叉(idx 78)→死叉(idx 169)完整往返、期末空仓
- **oracle 与策略滚动窗口对齐**:`first_cross_index` 用全序列 EMA,策略用 am_size=40 窗口 EMA(每窗重播种),往返形态上两者同 bar 出信号(78/169 各自吻合);若换数据后二者错位,优先查窗口播种效应
- **on_trade 现金核算标准(含滑点,Task 11-13 统一)**:`calculate_pnl` 把逐笔滑点 `volume*size*slippage` 计入 net_pnl(backtesting.py:1119)但成交价不含滑点(`min/max(order_price, open)`,backtesting.py:722-725)→ 策略现金须记同一笔:`slip = trade.volume * getattr(engine,"size",1) * getattr(engine,"slippage",0.0)`;买入 `cash -= cost+fee+slip`、卖出 `cash += cost-fee-slip`(评审方案 ii,已实测)。如此 `cash == CAPITAL + net_pnl − |pos|*last_close` 在任意成本设置下精确成立;仅按价格记账会差 Σslippage(默认 0.01×~1530 股×2 笔 ≈ 30,远超 1e-6)。rate 佣金双边公式天然一致(`turnover*rate*size` vs `cost*rate`,size=1)
- 成交量断言不受 t+1 开盘价影响:`plan_shares` 的现金约束也用决策收盘价折算,引擎无资金约束全额成交 → `volume == int(CAPITAL/close_t)` 恒成立
- `ArrayManager(size=N)` 需 N 根才 inited → am_size 必须 ≪ 数据长度(240 根数据 am_size=240 时仅最后一根有效,零交易)

## 策略层(Task 11)

- **BAR 模式撮合时序(backtesting.py:649-656)**:每根 bar 先 `cross_limit_order` → `cross_stop_order` → 才 `strategy.on_bar`,故 on_bar/on_trade 里下的单最早在**下一根** bar 撮合;但同 bar 内 limit 段先于 stop 段,stop 段遍历的是 limit 段结束后的 `active_stop_orders` 快照 → 限价单成交回调 on_trade 里 `cancel_all()` 能拦截残留 stop 单**在同一根 bar** 继续撮合(TP 成交后 SL 不会同 bar 误触发,已实测 active_stop_orders 清空)
- **stop 单语义(1.4.1 backtesting.py:744-798)**:空头 stop 触发条件 `stop_price >= bar.low_price`,成交价 `min(stop_price, bar.open_price)`;限价空头为 `high >= 委托价` 触发、成交价 `max(委托价, open)`;两类成交价都**不含滑点**,滑点只在净值侧扣(:1119)→ 止损成交价可精确断言 `== round(entry*0.95, 2)`(±0.01),止盈跳空成交价恰为 TP 本身(不追高开盘价)
- **brief 止损数据 bug:温和阴跌(-2/根)走不出止损**——从 110 下跌需 7 根才触及 SL=95.95,EMA3/10 死叉在 close=104(bar 52)先发生,走了死叉兜底、卖出 98.8,`sell <= buy*0.95` 断言必挂;改 **-8/根急跌**:第 2 根 low=93.06 < 95.95 即触发 stop(成交 95.95),死叉来不及形成
- **brief 死叉兜底数据 bug:110 横盘永不死叉零卖出**——上涨后横盘时 EMA3 恒高于 EMA10(快线收敛更贴近价格),`f0>=s0 and f1<s1` 永假;改为温和回落至 **105 横盘**(low=103.95>95.95 不触 SL、high=111.1<121.2 不触 TP),死叉在横盘第 2 根出现并兜底清仓
- **金叉建仓用 entry_basis=cash + 急跌形态时现金会短暂为负**(990 股@101 全仓 + 费滑 ≈ -99.89):plan_shares 只按决策收盘价约束股数,引擎无资金检查全额成交;与 cross 一致,不影响现金守恒恒等式(实测误差 0)
- **tpsl 注册表默认值取已验证配置**(entry_basis=cash、am_size=30、tp=10/sl=5),与 brief 类默认(am_size=100)略有出入:am_size=30 预热更快且为测试实参;3 条 cross 条目逐字节不变(JSON 对比验证)

## 策略层(Task 12)

- **ArrayManager 内省(vnpy 4.5 实测)**:`donchian(n, array=False)` 默认返回 `(up[-1], down[-1])` 标量对(talib.MAX/MIN 末值)、`atr(n, array=False)` 返回标量 `result_array[-1]` → brief 代码 `entry_up[-2]`/`atr[-1]` 对标量下标必崩(TypeError);适配为 `array=True` 取 ndarray,`[-2]` 即昨日通道、`[-1]` 即当根 ATR,行为意图不变
- **on_trade 现金核算按 Task 11-13 统一标准补 slip 项**(brief 版漏记滑点):`slip=volume*getattr(engine,"size",1)*getattr(engine,"slippage",0.0)`,买 `-cost-fee-slip`、卖 `+cost-fee-slip`;现金守恒恒等式 1e-6 内精确成立(实测 total_net_pnl=259835.42 与 cash 严丝合缝)
- **入场点手算 oracle(测试强断言)**:入场 bar=idx 60(close 102 > 昨日 20 日高 101);横盘段 TR≡2.0(high-low=2)、入场 bar TR=max(4.02,3.02,1.0)=4.02 → ATR=(2.0*13+4.02)/14=30.02/14≈2.1442857,与 talib.atr 逐位相等(已实测);unit=floor(1e6*1%/2.1442857)=4663 精确断言(4 单加仓 4663/4422/4257/4153,共 17495)
- **brief 数据注释 bug:"暴跌触发 2N 止损" 实际不成立**——10 日通道下破先于 2N 止损发生(决策 bar idx 83:close 120 < exit_low_prev 123.75,而 stop=108-2*ATR≈102.93 从未被 low≤118.8 触及)→ 全平走 cancel_all+限价卖,成交 max(114.0, open 120)=120;测试名 `test_stop_loss_full_exit` 保留(意图=暴跌全平),断言 buys==sells + pos==0 + 无残留 stop 单
- **registry 扩展保持原 6 条目逐字节不变**(git diff 仅增行):`turtle` 条目 `signal=None`、`kind/mode="turtle"`,defaults 键集合 == `TurtleStrategy.parameters` 集合(程序化断言);defaults 取测试实参配置(atr_days=14、am_size=60;类默认 am_size=100)

## 策略层(Task 13)

- **ArrayManager 暖机边界(utility.py:529-531 实测)**:`inited` 于第 `size` 次 update 即置真 → 首个决策 bar = `bars[am_size-1]`、t+1 首笔成交 = `bars[am_size]`(brief 的 `bars[10]` 断言按"暖机后"语义成立);`make_bars` 按自然日逐日生成(含周末),"每周期首个交易日"即该周期首个 bar
- **brief 测试三处适配**:`TradeData.time` 不存在→`datetime`(Task 7);`direction.value==1` 不成立→枚举直比(Task 10);test_amount_floor 的 `step=0.05` 使决策收盘 100.45→`floor(1000/100.45)=9` 股且次月还能买 1 股(与"恰 1 笔 10 股"矛盾)→改 `step=0.0` 恒价 100,10 股后现金 48.9<一股价、后续全跳过,现金 oracle 48.9 精确断言
- **brief CAPITAL=10_000 不够 400 根月定投全程**:14 个周期全额定投需 ≈13.2k,现金 2022-11 即耗尽 → 2023 年零买入,跨年月键 (2023,1) 无法验证 → test1/test4 提到 20_000,并加全覆盖 oracle `{2022-01..2023-02}` 每月恰一笔
- **现金硬约束语义(brief 防护,测试已验)**:`if self.cash < bar.close_price: return` + `shares=floor(min(amount, cash)/close)` → 现金不足额定但够 1 股时按能力部分买入;weekly 10k/amount500 场景共 24 笔(≥brief 阈值 20),biweekly 14 笔(≥10)
- **ISO 锚定**:200 根自 2022-01-03(ISO 周 1 周一)止于 07-22(周 29),暖机 10 根落在周 2 周中 → 首笔当周即买("区间起点锚定"语义),周 2..29 全有买入;biweekly 的 `(year, week//2)` 跨年边界 demo 可接受(本测试数据不跨年,未暴露)
- 现金守恒恒等式 1e-6 精确成立(期末 pos>0);registry 原 7 条目仅增行,`dca` defaults 取测试验证配置(am_size=10),键集合 == parameters 集合

## 曲线导出(Task 14)

- **`daily_results` 结构证据(1.4.1 backtesting.py)**:实例属性 `dict[Date, DailyResult]`(:93,`Date = datetime.date`,:1-7),键为 **date 非 datetime**;每根 bar 经 `new_bar → update_daily_close(bar.close_price)` 建条目(:641-647,:649-656)→ **逐 bar 一条**(240 bars → 240 条,实测),无成交日也有条目。`DailyResult` 含 `close_price/net_pnl/end_pos/start_pos/trading_pnl/holding_pnl`(:1056-1078)→ brief 取数结构成立,`daily_pnl.get(b.datetime.date(), 0.0)` 无需归一化。`dir(BacktestingEngine)` 只列 `get_all_daily_results/update_daily_close`——`daily_results` 是实例属性,运行时才存在,不影响使用
- **brief 代码 bug(沿 Task 7 已证):`t.time.date()` 必抛 AttributeError**(TradeData 无 `.time`,object.py:154-175)→ 改 `t.datetime.date()`
- **契约以事实书为准**:brief Interfaces 行写 `benchmark_placeholder: None`,其 Step 3 代码与事实书公共契约一致为 `Curves(dates, equity, position_value, cash)` 4 字段 → 按 4 字段实现,benchmark 留 Task 15 接
- **端点 oracle 实测**:round_trip_closes(240)+Task 10 PARAMS(ema 5/20、entry_pct 100、total、am_size 40)→ 恰 2 笔成交(LONG 1533 @2023-03-22 / SHORT 1533 @2023-06-21),`strategy.cash − Σnet_pnl = CAPITAL` 精确(期末空仓)→ 断言 `cash[-1] ≈ strategy.cash`(abs 1e-6)通过,与 Task 13 恒等式互证
- **枚举值勘误**:实测 `Direction.LONG.value == 'Long'`(非 Task 10 记录的 '多',vnpy 4.5.0 实装值);曲线层用枚举直比不受影响,后续任何依赖 `.value` 的代码以 'Long'/'Short' 为准
- **格式门禁为 `ruff check`**:仓库 23 个既有文件不满足 `ruff format`(含 runner/strategies),格式化非门禁;新文件与现有风格一致
