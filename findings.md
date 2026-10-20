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

## 指标层(Task 15)

- **brief 手算值与公式契约冲突(契约胜出,已修测试)**:`test_beta_of_perfect_tracker` 原断言 `information_ratio ≈ 0.0`;但完全同步 → rp−rb 恒为 0、std(ddof=1)=0,spec §7 规定 std=0 → None(0/0 无定义)→ 断言改 `is None`,注释留了重新推导
- **新增 n<3 护栏测试**(brief 缺):eq=[100,101]/bench=[100,99] 按索引前对齐取短者 n=2 → 8 项指标全 None;共 5 个新测试,全量 57 passed(52 基线 + 5)
- **实现与 brief 差异均为形式性**(数值语义不变):`_NONE_KEYS` 模块常量、eq/bench 显式 `np.asarray`、alpha 走 if 块并 `float()` 包裹(brief 两处条件表达式超 100 列,改局部变量 rp_std/ex_std)、mdd 免 `if len` 卫语句(n≥3 已保证);β/α/夏普/IR/MDD 与独立 numpy 手算交叉验证 1e-12 一致
- **np.float64 提示**:除 alpha 已包 float 外,`beta = cov/var` 恒为 Python float;若后续 Task 16 传给严格类型校验,注意 numpy 标量(np.float64 是 float 子类,json 序列化安全)
- **基准曲线**:`benchmark_relative_curve` 首值精确 0.0、capital 按契约保留未用、空 bars → `[]`;格式门禁仍是 `ruff check`(仓库 26 个既有文件不满足 ruff format,新文件随现有风格)

## 结果装配(Task 16)

- **update_setting 行为证据(1.4.1 template.py:44-50,决定免过滤)**:`CtaTemplate.update_setting` 遍历**策略类声明的 `parameters` 列表**,仅对 `name in setting` 的键 setattr → setting 中的多余键(entry_pct/entry_basis 之于 turtle、fast_period 之于 dca)被**静默忽略、不抛异常**(`__init__` 末尾同样走 update_setting,:47)→ 装配无需按 defaults 键集过滤 `strategy.params`,8 形态共用统一超集参数安全
- **vnpy stats 实测类型(Task 16 转换依据)**:`start_date/end_date` 为 `datetime.date`(非 str/Timestamp,df.index[0] 赋值后实测)→ `strftime("%Y-%m-%d")`;`total_days/total_trade_count` 为 np.int64 → `int()`;`total_commission/total_turnover/max_drawdown/return_drawdown_ratio` 为 np.float64 → `float()`(max_drawdown 为**负美元额**,-12478.77 实测;**键冲突已修**:vnpy 美元口径 MDD 改名 `max_drawdown_amount` 并入,风控层正小数 MDD 保留 `max_drawdown` 键名,spec §7 前端直接消费)
- **brief 代码 bug(沿 Task 14 已证):`t.time.strftime` 必抛 AttributeError**(TradeData 无 `.time`)→ 改 `t.datetime.strftime("%Y-%m-%d")`;brief 的 `Offset` 导入未用已删
- **校验决策**:仅 BAD_PARAMS 校验 `strategy.type` 存在;tp/sl 缺省由 registry defaults 补齐(tpsl 默认 10/5),不做显式 ≤0 拒绝(缺 key ≠ 非法,决策留档)
- **entry_basis 语义注意**:装配 `"entry_basis": request 值 or "total"` 按契约统一——API 请求省略 entry_basis 时会覆盖 tpsl registry 默认 "cash"(Task 18 API 层若显式传参则无影响,已留意)
- **compute_risk_metrics 传参**:显式传 `annual_days=Settings.annualization_days` + `risk_free_rate=Settings.risk_free_rate`(settings 有 annualization_days=250,与默认一致);全产物 json.dumps round-trip 实测通过
- **测试**:brief Step 1 + 追加 macd sub(dif/dea/hist)与 turtle overlays/sub 双空,共 3 个新测试;全量 60 passed(57 基线 + 3),`svc._load_symbol_bars` monkeypatch try/finally 还原

## API 层(Task 18)

- **session factory 不走 lifespan**:starlette 1.9 的 `TestClient(app)` 无 `with` 不触发 lifespan 事件,`app.state` 方案必 AttributeError → 改 `app.main.get_session_factory()`(每请求直调 `init_session_factory(data/backtest.db)`,SQLite 廉价);路由经 `deps.resolve_session_factory`(Annotated Depends)在**请求期**解析 `app.main.get_session_factory` 模块属性——导入期 `from app.main import` 捕获的函数引用会绕过 monkeypatch,必须模块属性延迟解析
- **POST /backtests 响应显式挑 5 字段**(request/metrics/curves/candles/trades),stats_raw 含 vnpy 原生对象非 JSON 安全且不在 spec §8 契约;max_drawdown(0..1)+ max_drawdown_amount(美元)双口径同在 metrics,与 Task 16 契约一致
- **422→400**:pydantic/FastAPI 校验失败默认 422,与 spec §8 错误模型不符 → errors.py 增 `RequestValidationError` handler 转 400 BAD_PARAMS;detail 只留 loc/msg(pydantic v2 的 `exc.errors()` ctx 可能含异常对象,直接 jsonable 会炸)
- **单一事实源**:`StrategySpec.type: Literal[STRATEGY_TYPES]` 的元组直接 `tuple(STRATEGY_REGISTRY)`,meta 端点与请求白名单天然同源;entry_pct (0,100] 校验用 model_validator 仅对 6 个信号形态生效;CostConfig 无 commission_fixed(spec 已移除),service 侧从 settings 补缺省
- **ruff B008**:`Depends(...)` 作默认值被禁 → `FactoryDep = Annotated[sessionmaker, Depends(...)]` 别名;注意 Annotated 参数无默认值,**必须放在 Query 等带默认值参数之前**(Python 语法限制,非 FastAPI 限制)
- **data/fetch 语义**:仅"验证标的可拉+摘要"——`check_symbol` 前置(INVALID_SYMBOL 400)、warmup=0、空 bars → NO_DATA 404;`cache_hit` 恒 false(bars 未透出来源,YAGNI 留档)
- **测试**:4 个新测试(run_and_history/bad_type_400/meta_strategies/data_fetch),全量 **66 passed**(62 基线 + 4),ruff 全绿;手动冒烟另验 DELETE/GET 未知 id → 404 RUN_NOT_FOUND、entry_pct 150/warmup 5 → 400、openapi.json 6 路径齐全(**勘误**:初版此处误记 "commission_fixed → 400"——冒烟脚本 body 复用残留 entry_pct=150 才是真因,实为静默 200;评审指正后 cost 未知键经 `extra="forbid"` 才真正显式 400)
- **评审修正(日期与 cost 未知键)**:`start/end` 改 pydantic `date` 类型自动 ISO 解析,畸形日期不再穿透 service 层炸 `date.fromisoformat`(500),而是 422 → 统一 400 BAD_PARAMS;连锁:`model_dump(mode="json")` 把 date 序列化回 ISO 字符串再传 execute_backtest,data/fetch 传 `.isoformat()`;`CostConfig` 加 `model_config = ConfigDict(extra="forbid")`,未知键(如 commission_fixed)显式 400。修正后全量 **68 passed**
- **entry_basis 对 6 个信号形态无行为差异(评审洞察)**:信号形态建仓仅发生在 pos==0,而 pos==0 时 equity==cash 恒成立,total/cash 两种 basis 的仓位输入相同 → tpsl registry 默认 "cash" 与 API 默认 "total" 无实际分叉(Task 16 记录的"API 省略 entry_basis 覆盖 tpsl 默认"因此无行为影响)

## 终审修复波(2026-10-20,Final Review M1-M4)

- **C1 signal_kind 注入缺失(实锤)**:修复前 params 装配(service.py 原 :105-108)不含 signal_kind 键,6 个信号形态全部落到 `CrossTradeStrategy/CrossTpslStrategy` 类默认 `signal_kind="ema"` → macd_cross/kdj_* 实际按 ema 信号回测(脚本复刻旧装配验证:`'signal_kind' in params == False`,registry signal=macd vs 类默认 ema)。修复:`_assemble_params(meta, strategy_cfg, warmup)` 纯函数置首注入 `meta["signal"]`,仍被用户 params 覆盖(保持顺序语义);turtle/dca(signal=None)不加该键。测试 tests/engine/test_signal_kind.py:6 形态注入断言 + 用户覆盖断言 + turtle/dca 无键断言
- **F2 注册表↔parameters 对齐(按字面断言不可行的修正)**:brief 原文 `{"entry_pct","entry_basis","am_size"} ⊆ cls.parameters` 对 8 条目全量断言必挂——turtle.parameters 无 entry_pct/entry_basis、dca 仅 3 键,系设计使然(装配超集键被 update_setting 静默忽略)。修正为:8 条目全量断 `defaults ⊆ parameters`;signal 形态(6)另断 `{signal_kind, entry_pct, entry_basis, am_size} ⊆ parameters`
- **I1 CORS**:pydantic-settings 2.16 对复杂类型(list)**先在 source 层强制 JSON 解码**,非 JSON 的逗号分隔 env 在 field_validator 之前就 SettingsError(brief 预判的"验证一下"实锤不生效)→ 需 `Annotated[list[str], NoDecode]` 挂掉 source 层解码,validator 内同时收 JSON 数组与逗号分隔两种写法
- **I2 RATE_LIMITED**:yfinance 1.7.0 内省有专用 `yfinance.exceptions.YFRateLimitError`(固定消息 "Too Many Requests. Rate limited. Try after a while.",唯一限流异常类)→ 匹配实现按类名+消息含 ratelimit/"rate limit"(case-insensitive)双通道,消息匹配兼容内部包装;非限流异常原样 re-raise。测试:消息伪造串 + 真实异常类 + ValueError 透传三例
- **I3 基准对齐**: `_aligned_close_series`(ffill/开头回填首值)产出与 dates 等长 close 序列供风控层(必须喂**价格**而非累计 % 曲线——累计曲线的逐日差 ≠ 对数收益,beta/IR 会失真);`_align_benchmark` 在其上算首值 0.0 的累计收益率 %。测试陷阱:make_bars 按自然日连续,构造内部日期缺口须 make_bar 手工跳日(初版测试 01-04 误以为缺失,实际有 bar)
- **I5 meta schema**:`_param_schema` 按 bool→str(enum 查 ENUM_MAP)→int(minimum:1)→number 判型;注意 bool 是 int 子类必须先判
- **I6 repo 拆列**:RunModel 增 metrics_json;list_runs 只反序列化 request/metrics 两列(测试以篡改 result_json 为垃圾串后 list_runs 仍工作证明零依赖);demo 库 backtest.db 为旧 schema,生产重启前需删除重建(无迁移,demo 可弃)
- **F8 turtle 2N stop 数据设计(初版巨阴构造不成立)**:平坦 60 根后直接巨阴,10 日通道低 99 > 巨阴 close,同 bar on_bar 的通道离场分支与 stop 混淆难辨 → 数据加 5 根回调@97 把 10 日低点压到 96.03、ATR 抬到 2.36(stop=97.27),巨阴 close 98 > 96.03(通道不触发)而 low 97.02 ≤ stop(击穿)→ 恰 2 笔:buy@102 / stop sell@97.27 = min(stop_price, open 102)(同 bar limit 段 on_trade 挂 stop、stop 段快照继续撮合,Task 11 结论复用)
- **F8 杂项**:500 文案固定"服务器内部错误"不回显 str(exc);BacktestRequest model_validator start<end(相等也 400);default_commission_fixed 删除(grep 仅 config 定义 + service 引用两处,service 侧改 `fixed=0.0` 显式注释,spec §8 已移除该键且 CostConfig extra="forbid")
- **测试规模**:68 → 105(+37;brief 预估 ~6-8 为非参数化口径,参数化 6/6/2/8 形态遍历展开后 37:signal_kind 15 + 对齐 8 + CORS 3 + 限流 3 + 基准 3 + schema 1 + repo 1 + 日期序 2 + turtle 1),ruff 全绿;openapi.json 与 frontend/src/api/schema.json 已重新导出同步(6 路径不变,schema 内容随 CORS/middleware 无 API 面变化、BacktestRequest 校验行为变化不进 schema)

## 前端(F0)

- **create-expo-app@5.0.0(SDK 58)无 `default-typescript` 模板别名**:brief 的 `--template default-typescript` 走 npm pack 解析直接 404(`expo-template-default-typescript` 包不存在,JS 模板已淘汰)→ 改 `--template default`(expo-template-default@58.0.25,默认即 TypeScript,tsconfig strict 已开)
- **frontend/ 非空冲突**:`frontend/src/api/schema.json`(后端 M4 导出)已被 git 跟踪,create-expo-app 拒绝非空目录 → 脚手架落在 .superpowers/(gitignored)临时目录再合并进 frontend/,schema.json 原样保留
- **SDK 58 模板结构差异**:路由目录在 `src/app/`(非根 `app/`),demo 为 Tab 布局 + 一堆演示组件(ThemedText/AppTabs/AnimatedIcon 等)→ 按 brief/CLAUDE.md 结构迁回根 `app/`,demo 屏/组件/hooks/constants/global.css 全删,仅保留 app.json 引用的资产(icon/splash/favicon/android 自适应图标/expo.icon);模板附带的 AGENTS.md、.claude/settings.json(启用 expo 插件)、.vscode/、scripts/reset-project.js、LICENSE、README 一并删除保持最小骨架
- **app.json web.output "server"→"static"**:SDK 58 模板默认 server 输出(需 Node 服务承载),与 CLAUDE.md「Electron 壳加载 dist/」矛盾 → 静态导出;`npx expo export -p web` 一次通过(3 条静态路由 /、/_sitemap、/+not-found,+not-found 为 expo-router 内置缺省)
- **brief jest transformIgnorePatterns 正则少一个右括号**:原样粘贴即 `SyntaxError: Unterminated group`(`(?!(` 开了两组只收了一组)→ 补收尾 `)`(…lightweight-charts`))`),语义不变;lightweight-charts 仅作为未来转发模式预留,本任务未安装
- **TS 6.0.3 + moduleResolution:"bundler" 不自动装载 @types/jest**:仅 @types/react 经 import 解析载入,describe/it/expect 全报 TS2593 → tsconfig 加 `types: ["jest"]`(编译器报错信息自带的修法)
- **expo install --dev 偶发失败**:`npx expo install --dev jest jest-expo @testing-library/react-native @types/jest` 前三个成功,@testing-library/react-native 一步 npm spawn 非零退出;直接 `npm install --save-dev @testing-library/react-native` 即成功(transient)。最终版本:@testing-library/react-native ^14.1.0 / jest ~30.5.2 / jest-expo ~58.0.11 / @types/jest 30.0.0
- **依赖集未裁剪**:模板依赖(SDK 对齐集)全部保留,未用到的 demo 依赖(reanimated/worklets/@expo/ui 等)不影响产物——export 只打包被 import 的模块;后续任务如需可再裁
- **忽略栈验证**:`git check-ignore` 证实 frontend/dist、node_modules、.expo、expo-env.d.ts 均被忽略(模板 .gitignore 与根 .gitignore 叠加无冲突);frontend/src/ 因已有 api/schema.json 天然非空,无需 .gitkeep

## 前端(F1)

- **BacktestResult 补 id 字段**:brief Interfaces 行未列 id,但后端 POST 响应 `{"id": run_id, **5字段}`、GET /backtests/{id}(repo get_run)均在响应内带 id → 按契约补上;确认无 stats_raw/created_at
- **candles.overlays/sub 及内层键全可选(Record 风格)**:brief Interfaces 行 `sub:{...}` 写成必填,父任务上下文明确"sub 可选、overlays 同理"→ 按 `overlays?`/`sub?` + 内层 `macd?/kdj?/ema_fast?/ema_slow?` 可选化(后端 turtle/dca 装配空对象,可选化对消费端更稳,运行时两者兼容)
- **Trade 字段实测补全**:brief 只给类型名未给字段 → 按后端 trades 装配(service.py)定为 `{time: string(YYYY-MM-DD), direction: "buy"|"sell", price: number, volume: number}`
- **非 2xx 文案优先级**:响应体 `message` 优先(测试②"message 来自响应"),缺失时回退 `errorMessage(code)` 映射,非 JSON 错误体(网关页)再兜底"请求失败"(测试覆盖第三分支);errorMessage 纯函数语义严格按 brief:已知码取映射,未知码/undefined 回退 `fallback ?? "请求失败"`
- **`global` 未定义(TS2584)**:`types:["jest"]` 不带 node 全局(tsc 报错信息:改用标准 `globalThis`)→ 测试 mock 用 `globalThis.fetch`,不动 tsconfig(F0 的 types 配置保持)
- **StrategyMeta.kind/mode 定为 string**:meta 端点对这两字段无枚举契约(registry 值如 "signal"/"long" 未在 openapi 收敛),不臆造联合类型;signal 按 SignalKind("macd"|"kdj"|"ema")| null 收紧
- **测试规模**:brief Step 1 的 4 组全实现 + 追加 fetchData/listRuns 查询参数/getRun/getStrategies 解包/非 JSON 错误体 5 项,参数化展开后 17 passed(含 smoke 1);`npx tsc --noEmit` exit 0
- **评审修正(metrics 值域放宽)**:初版 `metrics: Record<string, number>` 写窄了(dispatch 契约行口径)——后端实测三态:数值指标 / `start_date`、`end_date` 为 "YYYY-MM-DD" 字符串(vnpy stats 是 date,service 层 strftime)/ 风控 8 键在样本不足(n<3)时为 null(Task 15 契约)→ 改 `MetricsMap = Record<string, number | string | null>`,BacktestResult 与 RunSummary 同步;测试 fixture 补字符串与 null 值锁定该契约
- **评审修正(headers 合并)**:request 包装原 `headers: {...}, ...init` 展开顺序会把调用方传入的 init.headers 整体顶掉默认 Content-Type → 改 `{ ...init, headers: { "Content-Type": "application/json", ...init?.headers } }`,调用方自定义头与 JSON 头合并

## 前端(F2)

- **buildChartPayload 返回类型取 ChartPayload(brief 写 object)**:契约行签名为 `: object`,实现声明为导出的具体接口 `ChartPayload`(candles/emaFast?/emaSlow?/macd?/kdj?/lines/times)——它是 `object` 的子类型,所有按 `object` 接收的调用点(F3)照常兼容,同时让 F2 测试与 F3 消费端拿到字段级类型,免 `as` 断言(strict 禁 any 的最优解);行为与 brief 描述逐键一致
- **ema/macd/kdj 键用条件展开而非 undefined 赋值**:`...(overlays?.ema_fast !== undefined ? { emaFast: ... } : {})` 写法保证键直接不出现在对象里(JSON.stringify 后消失),并对未来若启用 exactOptionalPropertyTypes 也稳
- **toHistogramMacd 长度截短口径**:brief 写"与 times 取 min",实现为 `min(sub.hist.length, times.length)`(value 只来自 hist,dif/dea 长度不参与;后端三者等长,无实际分歧);0 计入红(≥0 分界,brief 明确)
- **toMarkers 颜色约定**:buy=绿 #26a69a/belowBar/arrowUp/"B",sell=红 #ef5350/aboveBar/arrowDown/"S"(lightweight-charts 官方示例配色,红绿与 MACD 柱国内约定一致)
- **HTML 生成**:单行拼接,`<script>const PAYLOAD = <json>;/*__INIT__*/</script>` 中 json 经 `replace(/</g, "\\u003c")` 全量转义(payload 段无裸 `<`,连非 script 的 `<` 一并转义,比只防 `</script>` 更保守);INIT_PLACEHOLDER 导出为常量供 F3 精确替换;测试用 `/const PAYLOAD = (.*);/` 从 HTML 抠回 JSON 且深度相等(含含 `</script>` 的恶意值字段)
- **测试规模**:brief Step 1 各组全实现 + 补 kdj 形态、0 值分界、多笔保序,18 passed(全量 35 = smoke 1 + api 16 + chart-data 18);`npx tsc --noEmit` exit 0

## 前端(F3)

- **lightweight-charts 5.2.1 导出面实测(npm,ESM-only)**:`CandlestickSeries/LineSeries/HistogramSeries/AreaSeries/BarSeries/BaselineSeries` 系列工厂常量 + `createChart/createSeriesMarkers/createTextWatermark` 等函数 + `ColorType` 等枚举;`version` 是**函数**非字符串。v5 markers 确为 `createSeriesMarkers(series, markers)`(brief 预期与实际一致);`addSeries(definition, options?: SeriesPartialOptionsMap[T])`,类型名 `XxxSeriesPartialOptions`、`ColorType.Solid = "solid"`(脚本串里直接写字面量 "solid" 双端通用)
- **standalone 5.2.1 全局导出面(下载 grep dist 文件确认)**:`window.LightweightCharts = {...}` 暴露与 npm 包**同一集合**(CandlestickSeries/HistogramSeries/LineSeries 常量、createChart、createSeriesMarkers 都在)→ init 脚本直接用 `LightweightCharts.CandlestickSeries` 等,无需字符串 fallback;注意 standalone 产物**非 UMD**(纯 IIFE 只写 window),不可 require
- **平台分派选 Metro 平台扩展(LightChart.web.tsx / LightChart.native.tsx,无 dispatcher 文件)**:react-native-webview 14.0.1 无 web 构建(exports 全无),运行时 Platform.OS 分派会把 webview 静态打进 web 包 → 必须按平台文件拆;不建 LightChart.tsx 占位(会被 web/native 双双遮蔽成死代码)。jest-expo haste 平台仅 `[android, ios, native]`(无 web)→ 测试中 web 实现只能显式路径导入,extensionless 导入在 jest 里解析到 .native
- **tsc 需要 `moduleSuffixes`**:expo/tsconfig.base(SDK 58)未设置,extensionless `import "./LightChart"`(ThreeLineChart)在 tsc 下 TS2307 → frontend/tsconfig.json 加 `[".native", ".web", ""]`(native 优先与 jest 默认平台一致;Metro 侧不受影响自行解析)
- **jest 里 lightweight-charts 不可解析**:exports map 仅 `import` 条件指向 .mjs(无 require),jest 30 的 CJS require 条件无匹配 → smoke 测试用 `jest.mock(..., { virtual: true })` 顶替(验证的是本仓库模块可导入性,非三方库本身)
- **buildChartHtml 升级选「缺省参保旧签名」**:`buildChartHtml(payload, initScript = INIT_PLACEHOLDER)`——单参调用输出逐字节不变,F2 测试零改动;显式传脚本时占位符被整体替换
- **ChartPayload 扩展两键(均向后兼容,F2 测试零改动)**:`macdHist?: HistogramPoint[]`(buildChartPayload 内调 toHistogramMacd 预映射,红涨绿跌颜色单一事实源,脚本/web 端零重复逻辑)、`markers?: TradeMarker[]`(toMarkers 产物,trades 为空则键缺省)——brief 的 "trades markers" 契约需要 payload 携带,而 F2 版 payload 无此键
- **渲染语义三端同源**:数据同走 buildChartPayload;配色/高度常量 `CHART_COLORS`/`CHART_HEIGHT` 从 chart-init-script.ts 导出供 web 实现与 ThreeLineChart 图例复用;LightChart.web 的 applySeries 与脚本的 BUILDERS 逐 series 对应(k=fast 色等约定见代码注释);init 脚本刻意 ES5(兼容旧 WebView)
- **Props 契约**:`LightChartProps.kind` 实现为 4 值超集(内部 lines 模式供 ThreeLineChart 复用),brief 契约的三值调用完全兼容;高度 candles 360 / macd·kdj 200 / lines 260
- **Metro web 打包实测**:临时在 app/index.tsx import 三组件后 `CI=1 npx expo export -p web` 通过(779 modules,index chunk 211KB 含 lightweight-charts),证明 Metro 平台扩展解析 + ESM 依赖打包无阻,验证后已还原;浏览器/真机冒烟按计划留 F7/F8
- **测试规模**:35 → 48(+13:chart-init-script 12 + charts-smoke 1);`npx tsc --noEmit` exit 0

## 前端(F5)

任务:配置页 + 结果页 + 历史页三页集成(2026-10-20)。状态:完成,无阻断性偏差。决策与口径记录如下:

- **jest.mock 工厂必须自包含(TDZ 实锤)**:babel-jest 把 `jest.mock` 提升到模块 const 声明之前,而测试文件自身的 `import` 求值就会触发被 mock 模块的工厂执行——工厂内直接引用外部 `const mockX = jest.fn()` 必然撞 TDZ(实测症状:`_client.getRun is not a function`,mock 模块半残)。定式:mock 函数在工厂内 `jest.fn()` 创建,import 求值后经 `jest.mocked(client.getRun)` 取回句柄;expo-router 工厂同法(router 对象闭包持有,`useRouter()` 每次返回同一实例,测试侧 `useRouter().push` 拿到稳定 mock)。
- **expo-router mock 做法(测试可复用)**:`Link` 以 `children ?? null` 直渲(类型注解编译期擦除,工厂无运行时越界引用)、`useRouter` 返回稳定 `{push, back}`、`useLocalSearchParams` 固定返回 `{id: "run-1"}`;无需 requireActual,无需 jest-expo 真路由环境。`app/result/[id]` 方括号路径 jest 解析无碍。
- **StrategyForm 挂载时机(Minor 3 的绕开方案)**:配置页以 `loaded` 门控——getStrategies 成功前渲染「加载策略元数据…」,就绪后才首次挂载 StrategyForm,组件内部 params 不随异步 metas 重置的问题从根上不触发(不改组件)。
- **加载失败 UX 补充(契约外微增)**:契约只要求失败时 Alert;但仅 Alert 会让页面永久停留「加载策略元数据…」误导用户 → 配置页失败补「策略元数据加载失败」文案,结果页失败补「回测结果加载失败」+「返回」按钮(router.back),历史页 load 失败仅 Alert 并保留已有列表。
- **formatMetric 未入库键兜底**:结果页 metrics 含 start_date/end_date 等 METRIC_LABELS 之外的键 → MetricCards 把它们追加在 12 个契约键之后、以键名兜底标签、值走字符串原样分支(顺带让结果页显示回测起止日期);"其余 number → toFixed(3)" 按契约字面执行,整数计数因此显示 "12.000"/"252.000"。
- **副图渲染按存在性**:`candles.sub?.macd !== undefined →「MACD」段`、`sub?.kdj →「KDJ」段`(ema 形态无副图,自然跳过);失败分支不渲染任何图表区块(测试断言)。
- **删除交互口径**:行内「删除」按钮(不做长按),deleteRun 成功后整表重拉(listRuns 复调)而非乐观删行;删除期间禁用按钮防连点。历史页固定 listRuns(1, 20),分页交互留后续。
- **RNTL v14 异步纪律(F4 教训复现并遵守)**:`await render(...)` / `await fireEvent.*` 全覆盖;pending promise 构造加载态(永不 resolve 的 mock)使「加载中」分支确定性可测,避免竞态。
- **web 导出冒烟**:`CI=1 npx expo export -p web` 三页全过(静态路由 /、/history、/result/[id]、/_sitemap、/+not-found 各 22KB),typed routes 未生成 .expo/types 时 Href 回退 `string | HrefObject`,`href="/history"` 与模板串 `router.push(\`/result/${id}\`)` 均 tsc 直过。
- **测试规模**:82 → 102(+20:formatMetric 6 / METRIC_LABELS 1 / MetricCards 1 / 配置页 4 / 结果页 4 / 历史页 4);suites 6 → 7;`npx tsc --noEmit` exit 0,零 any。

## 前端(F6)

任务:Electron 桌面壳(2026-10-20)。状态:完成,dist 模式冒烟实测通过。决策与偏差记录:

- **`loadFile` 相对路径基准是 app 根目录(main.js 所在目录),不是 cwd(实测两连坑)**:brief 的 `DESKTOP_URL=../dist/index.html` 实测解析到 `vn-demo/dist/index.html`(ERR_FILE_NOT_FOUND)——Electron 对 `loadFile(相对路径)` 按 app 路径(此处即 `desktop/`,因为启动方式是 `electron ../desktop/main.js`)解析,与 npm scripts 的 cwd(frontend/)无关;改 `./dist/index.html` 又落到 `desktop/dist/`。最终方案:main.js 显式 `win.loadFile(path.resolve(__dirname, target))` 锚定 main.js 所在目录(比依赖 app-path 语义更确定性,不受启动方式影响),script 传 `DESKTOP_URL=../frontend/dist/index.html`(相对 desktop/ → frontend/dist)。冒烟证据:Electron `--remote-debugging-port=9223` 后 `curl /json/list` 返回 page target `url=file:///…/frontend/dist/index.html`,加载成功无 `Failed to load URL` 告警。
- **desktop/ 位置在仓库根**(与 frontend 平级,按 CLAUDE.md 目录树),非 brief 原文暗示的 frontend/desktop;frontend scripts 因此为 `electron ../desktop/main.js`。
- **未引入 cross-env**:brief Step 1 写 `cross-env DESKTOP_URL=…`;npm scripts 实际跑在 sh,`VAR=x cmd` 内联可用,项目 macOS 优先,免依赖,Windows 支持留待需要时加。
- **electron 44.9.1(devDep `^44.9.1`)**:npm 11.19 下载二进制正常;注意 agent 沙箱环境默认注入 `ELECTRON_RUN_AS_NODE=1`,electron 二进制会退化成纯 Node(`--version` 打的是 Node v24.22.0 而非 Electron v44.9.1),冒烟/日常运行须 `env -u ELECTRON_RUN_AS_NODE`。
- **window-all-closed 全平台 quit(darwin 不保留)**:按 brief 简化处理,个人研究项目无需 dock 常驻语义。
- **测试规模**:102 → 102(无新增测试:main.js 为薄壳,无可单测纯逻辑,验证以语法兜底 + DevTools 协议冒烟代替);全量 jest 7 suites 102 passed 不变。

## 前端(F7)

任务:M5 收尾——集成冒烟 + README + 全绿(2026-10-20)。状态:完成;浏览器人工联调待用户验证,余无偏差。记录:

- **陈旧 dev 库 schema 漂移(create_all 不迁移,实锤 1 坑)**:首次 API 级回测 500,根因 `backend/data/backtest.db` 是 M4 Task 18 加 `metrics_json` 列之前创建的旧库(`runs` 表缺列,OperationalError);`init_session_factory` 的 `Base.metadata.create_all` 只建表不迁移。修法:删掉 git-ignored 的 dev 库重启即愈(测试全绿因 pytest 用临时库,故此坑只在长寿命 dev 环境暴露)。教训:dev 环境后端行为异常先查库 schema 版本,勿先疑代码。
- **API 层端到端链路全通(真实数据,未限流)**:healthz ok → meta/strategies 8 形态 → data/fetch AAPL 2025 全年 250 行(cache_hit=false,yfinance 实拉)→ POST backtests(ema_cross 默认参数,total_return 21.24%/max_dd 5.63%/sharpe 1.486/alpha 0.187/beta 0.154,curves 4 键/candles 250 bars/trades 6 笔)→ GET backtests 列表含该 run → GET 单条一致。前端消费的四个端点契约字段与 F1 手写类型逐一吻合。
- **curl 隐式走系统代理(坑)**:本机 curl 对 127.0.0.1 也被代理劫持(9000 端口返回 S3 风格 AccessDenied XML、9321 连接 000);`curl --noproxy '*'` 绕开。冒烟本地 curl 一律带 `--noproxy '*'`。
- **静态导出动态路由形态**:`expo export -p web` 对 `/result/[id]` 导出字面量文件 `dist/result/[id].html`(URL 编码 `%5Bid%5D` 可直取);普通静态服务器直链 `/result/<id>` 404 属预期,SPA 内客户端导航与 Electron dist 模式(loadFile 后路由全在客户端)不受影响;若需静态托管支持深链,服务器需配 SPA fallback(留 M6 部署时处理)。
- **9321 等本地端口起 python http.server 可行**,但 9000 被本机其他服务占用(S3 风格响应),冒烟换端口即避。
- **产物冒烟证据**:index.html 200(22KB)、entry/index/history bundle 全 200、history.html/_sitemap.html/result/[id].html 全 200;后端与静态服务进程已 pkill 清理,端口 8000/9321 复核为空。
- **测试规模**:102 passed / 7 suites 不变(F6 后无新代码,本任务为文档+冒烟);`npx tsc --noEmit` 干净;`npx expo export -p web` 复验通过(5 路由)。

## Docker(D0)

任务:后端镜像(python:3.12-slim + uv frozen;2026-10-20)。状态:完成。记录:

- **ta-lib 路线:wheel(计划中的 apt 编译层已删)**。uv.lock 锁定 ta-lib 0.8.2(PyPI),`>=0.5` 起 manylinux wheel 捆绑 C 库;linux/arm64 cp312 wheel 直接装好,容器内 `talib.SMA` 实算正确(3.5),无需 build-essential、无需 0.6.4 源码编译 fallback。镜像因此不含任何 apt 编译层。
- **构建实测**:首建 2:57(含镜像导出);改 `UV_NO_CACHE=1` 后重建 1:42(uv sync 80.7s + 导出 19.8s)。镜像 **1.79GB**(未加该 env 时 3.34GB——uv 下载缓存留层浪费约 1.55GB,已记入 Dockerfile 注释)。
- **体积大头是 vnpy 4.5.0 的 GUI 依赖**:site-packages 内 PySide6 635MB、pyarrow 148MB、pandas 44MB;vnpy 4.5.0 硬依赖 Qt 栈(shiboken6/qtpy/pyqtgraph),headless 镜像无法规避,1.79GB 属合理水位。
- **偏差:data_dir 显式化**。`Settings.data_dir` 默认相对 CWD 的 `Path("data")`,计划 Dockerfile `WORKDIR /app` 会让 SQLite 落 `/app/data`,与约定挂载点 `/app/backend/data` 不符;经 pydantic-settings 的 `VNDEMO_DATA_DIR=/app/backend/data`(env_prefix VNDEMO_)显式指定,容器内实测 `backtest.db` 落位正确。D2 数据卷按此路径挂载。
- **docker/.dockerignore 对 `-f docker/backend.Dockerfile` 生效的机制**:BuildKit 按 `<dockerfile>.dockerignore` → Dockerfile 同目录 `.dockerignore` → 上下文根 `.dockerignore` 三级查找;文件放 docker/ 目录即命中(勿排 `docker/` 自身,D1 的 `COPY docker/nginx.conf` 需要它进上下文)。
- **镜像自足性**:应用运行时自建数据目录(`db/session.py`、`data/cache.py` 均 `mkdir(parents=True)`),Dockerfile 无需预建;healthcheck 用 python urllib(D2),镜像无需装 curl,进一步省 apt 层。
- **冒烟证据(最终镜像)**:`docker run -d -p 8000:8000` → `curl --noproxy '*' 127.0.0.1:8000/healthz` = `{"status":"ok"}`;`/api/v1/meta/strategies` 8 形态(macd_cross/macd_tpsl/kdj_cross/kdj_tpsl/ema_cross/ema_tpsl/turtle/dca);容器内 `import vnpy` 4.5.0、talib SMA 实算通过;测试容器已清理。

## 前端(终审修复波)

任务:M5 前端终审 7 项修复(F-I1/I2、F-M1-M5)单波完成(2026-10-20)。状态:完成,109 测试绿 + tsc 干净,单提交推送。记录:

- **三线图单位混轴(F-I1)**:`buildChartPayload` 原样透传 `curves.equity/position_value`(绝对资金额,百万量级)与 `benchmark`(累计收益率 %,个位量级)同画一张 lines 图,基准线被压成贴地直线。修法:新增 `toCumReturnPct(values, initialCapital)` 归一化 equity/position 为 `(v/本金-1)×100`,benchmark 原样(spec §7 三线同轴,起点 0);ThreeLineChart 图例追加单位说明「三线均为累计收益率 %,起点 0」。坑:浮点经除乘后 `1_010_000 → 1.0000000000000009`,断言一律 `toBeCloseTo(x, 9)` 禁 `toBe`。
- **am_size 死控件(F-I2)**:后端 `_assemble_params` 无条件用 warmup_bars 覆盖 `am_size`,前端表单却渲染该输入并随请求上送——UI 双输入,实际只有一个生效,误导用户。修法:StrategyForm 三处(参数控件区 paramKeys / createInitialState / buildRequest)统一经 `NON_PARAM_KEYS`(entry_pct/entry_basis/am_size)排除,请求 params 不再带 am_size;测试断言 state 携带 am_size 时产物也不含。
- **结果页失败态残留(F-M1)**:`useEffect` 以 `[id]` 为依赖重拉,但 `failed` 只置 true 从不复位——失败后路由换 id 重进同组件(remount 场景之外)会永久卡失败视图。防御性一行:重拉前 `setFailed(false)`;测试经 expo-router mock 暴露可变 `__routeParams` 容器 + `rerender` 驱动 id 变化(失败 → 换 id → 断言内容恢复渲染)。
- **整数指标格式(F-M2)**:`total_trade_count/total_days` 原走 `toFixed(3)` 渲染成 `12.000/252.000`,计数语义失真。新增 `COUNT_KEYS` 集合,整数直接 `String(value)`(带 `Number.isInteger` 守卫,非整数值回退 toFixed(3));百分率/比率键口径不变。
- **Electron did-fail-load 静默(F-M3)**:dev server 未起/静态产物缺失时白屏无任何终端线索。`desktop/main.js` 加一行 `webContents.on("did-fail-load", ...)` 输出 `[vndemo] load failed: url code desc`。
- **类型诚实化(F-M4)**:`StrategySpec.entry_pct/entry_basis` 改可选(与后端契约一致:turtle/dca 省略,后端默认 100.0/"total"),`buildRequest` 非 signal 分支的 `as StrategySpec` 断言随之删除;护栏为「类型级测试」——测试内直接 `{ type: "turtle", params }` 构造 StrategySpec,entry 字段必填时该文件 tsc 直接报错 TS2739。
- **jest.mock 工厂导出可变状态的模式**:mock 工厂不能引用外部变量(TDZ),但可以在工厂内建对象、以非标准导出(如 `__routeParams`)暴露,测试侧 `import * as Mod` 后经类型断言取回——render 时才求值的闭包读模块级可变容器,是驱动「路由参数变化」类测试的干净做法。
- **测试规模**:102 → 109(+7:F-I1 两例/F-I2 三例/F-M1 一例/F-M2 两例);`npx tsc --noEmit` exit 0;desktop/main.js 经 `node --check` 语法兜底(无 electron 测试基建)。

## Docker(D1)

任务:前端镜像(expo export + nginx SPA fallback;2026-10-20)。状态:完成。记录:

- **构建实测**:首建 1:11(npm ci 约 40s + expo export 11.5s);改 ARG 值重建 59s(ARG/ENV 变更自该层起全部失效,npm ci 必重跑——换 API base 即全量重建,层缓存救不了)。镜像 **25.2MB**(`docker image inspect .Size`,nginx:alpine ≈22MB + dist ≈3MB;containerd store 的 `docker images` 表显示 94.1MB 是含共享快照的 disk usage 口径,非镜像真实大小)。D0 后端 1.79GB 对比,前端体量可忽略。
- **API base 注入证明(严格版)**:`client.ts` 写的是 `process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000"`,默认镜像里 grep 到 `localhost:8000` 无法区分是「注入成功」还是「走了 ?? 缺省字面量」。实测用 marker 值 `--build-arg EXPO_PUBLIC_API_BASE=http://vndemo-inject-check:9999` 另建一镜像:bundle 内出现 `const t="http://vndemo-inject-check:9999"`,且该镜像 bundle 里 `localhost:8000` 计数为 **0**(压缩器把 `非空字面量 ?? 缺省` 整体折叠,缺省分支被消除)——build-arg 内联实锤,运行时 env 无效也随之证实。
- **SPA fallback 实测**:nginx `try_files $uri $uri.html $uri/ /index.html`(listen 8080 免特权);`/`=200、`/history`=200、`/result/42` 深链=200——解决了 progress.md M6 前静态导出直链 404 的遗留(python http.server 无 fallback 能力)。expo static 导出 5 路由(/、/history、/_sitemap、/+not-found、/result/[id])。
- **`.dockerignore` 复核(D0 提醒项)**:确认未排 `docker/`(nginx.conf 需进上下文)与 frontend 源码;`frontend/node_modules`、`frontend/dist`、`frontend/desktop`(Electron 壳)已排除,`*.md` 只排根级不影响 frontend 子目录源文件。`COPY frontend/` 实际带入体积约 3MB(源码+assets),上下文无 node_modules 拖累。
- **nginx 配置细节**:静态段 `location /_expo/static/` 加 `immutable` 长缓存(文件名带内容哈希)+ `try_files $uri =404`(资源缺失就该 404,不回退 html);html 入口走默认无缓存头,便于换版。
- **`npm ci --no-audit --no-fund`**:devDependencies 全量装(electron postinstall ~100MB 下载在 build 阶段,不进最终镜像);未用 `--omit=dev`(typescript 等在 dev,expo export 的 Metro 链路对缺依赖行为不可控,稳妥优先)。
- **冒烟证据**:`docker run -d -p 8080:8080` → `/`=200(含 root div 的 index.html)、`/history`=200、`/result/42`=200;bundle 内嵌 API base 已验证;测试容器与 marker 镜像均已清理。

## Docker(D2)

任务:compose 编排与文档(2026-10-20)。状态:完成。记录:

- **compose 实测**:`up -d --build` 全程 **18.3s**(D0/D1 已建镜像,层缓存全命中,仅 provenance/元数据 + 容器创建启动);首见 `Container vndemo-backend-1 Waiting → Healthy → frontend Starting`,depends_on service_healthy 生效。两服务 Up、backend (healthy);`/api/v1/meta/strategies` 8 形态;前端 `/`、`/history` 均 200。
- **独立启停 + 隐含行为**:`stop frontend` 后 backend 仍 Up(healthy)、healthz 正常;`start frontend` 时 compose **重新等待 backend healthy 才启动前端**——depends_on: service_healthy 不仅管首次 up,也管单独 start,属合理语义。
- **真实回测(compose 环境)**:POST /api/v1/backtests(AAPL 2023-01-01~2025-12-31,ema_cross 5/20)200,耗时 **3.3s**(容器内 yfinance 真实联网拉数,数据卷首挂为空无缓存);total_return **0.0846**,metrics **16** 键,trades **34** 笔,净值曲线 752 点;结果 GET 回放 200。
- **数据卷落位证据**:容器内 `backtest.db`(172KB)+ `cache/` 均在挂载点 `/app/backend/data`(命名卷 `vndemo_backend-data`);`down` 后卷保留(`docker volume ls` 可见)。
- **对计划起点的两处微调(均已写进 compose 注释与 docker/README.md)**:① 顶层 `name: vndemo`——目录名 docker 作默认项目名太泛(容器会是 docker-backend-1、卷 docker_backend-data,与他项目易撞),定名后为 vndemo-backend-1 / vndemo_backend-data;② healthcheck 加 `start_period: 15s`——vnpy import 链路冷启动可能超过首个 30s 探测间隔,加宽限期避免启动期误判 unhealthy。其余(两服务/healthz python urllib/卷/build arg 默认值)与计划一致。
- **README(docker/README.md)覆盖**:构建/启动/停止/独立启停/清理(down vs down -v)、端口表、EXPO_PUBLIC_API_BASE 构建期内联说明(本机浏览器场景用默认 localhost:8000;跨机部署需改宿主 IP 重建前端镜像,ARG 失效全量重建 ~60s)、数据卷红线(首挂必须空卷:create_all 不迁移,旧 schema db 进卷接口 500,`down -v` 删卷即愈、台账随之清空)、镜像大小参考(backend ~1.8GB 因 vnpy 硬依赖 Qt/PySide6;frontend ~25MB)、ta-lib wheel 路线一句话记录。

## 前端(D3 Electron dist 路由)

任务:验收收尾(2026-10-20)。状态:**实测失败,列后续兜底项**。记录:

- **测试方法**:expo export 重建 dist(21:49 修复波后 dist 已过期,先重建)→ `DESKTOP_URL=../frontend/dist/index.html npx electron ../desktop/main.js --remote-debugging-port=9222` → DevTools HTTP API(`/json/list` 拿 webSocketDebuggerUrl)→ backend venv 的 python `websockets` 库发 `Runtime.evaluate` 探针(系统 python 无 websocket 库)。
- **直调 history.pushState:不抛 SecurityError**。`history.pushState({}, '', '/history')` 返回 OK,pathname 变 `/history`,且应用渲染出历史页——brief 预设的「file:// opaque origin 抛 SecurityError」假设**不成立**(Chrome 152 对 file:// 的 pushState 同文档路径切换放行)。
- **真实 Link 点击:整页硬导航 → 白屏**。点击 `<a href="/history">` 后 250ms 内 document 被替换(埋点 `window.__log` 随旧文档销毁),主进程日志实锤 `load failed: file:///history -6 ERR_FILE_NOT_FOUND`,窗口落 `chrome-error://chromewebdata/`。expo-router 在 opaque origin(origin=null)下将站内 Link 判为外部链接走 `window.location` 整页导航,根本没走 pushState。
- **结论与影响面**:Electron **dist 模式跨路由导航失败**(点任何 Link 白屏,需重启恢复);**dev 模式**(http://localhost:8081)与 **nginx 托管 web**(SPA fallback)不受影响。桌面 dist 形态在兜底落地前不可用于跨路由操作。
- **兜底后续项(三选一)**:① expo 导出改 hash 路由;② Electron main.js 内嵌 http 服务托管 dist;③ main.js `will-navigate` 拦截 `file:///<route>` 改 SPA 导航。未在本任务实施(任务时间盒外)。
- **坑**:上一探针点击 Link 白屏后窗口落 `chrome-error://chromewebdata/`,此时 `location.href = location.href` 无法重载回应用,须 `Page.navigate` 显式导航回 index.html 绝对路径。
- **沙箱坑(复现 F6 教训)**:Electron 子进程仍会带 ELECTRON_RUN_AS_NODE,必须 `env -u ELECTRON_RUN_AS_NODE` 启动,否则 9222 端口永不监听。
