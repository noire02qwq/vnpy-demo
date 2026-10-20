# vnpy 4.x + vnpy_ctastrategy 代码级尽调（无 GUI 日频 K 线回测服务设计依据）

- 调研日期：2026-10-20
- 代码基线：`vnpy` tag **4.5.0**（commit c6e231c）、`vnpy_ctastrategy` tag **1.5.0**（commit 7a8768d）
- 克隆位置：`/tmp/vnpy-research/vnpy`、`/tmp/vnpy-research/vnpy_ctastrategy`（均 `--depth 50`，master == 4.5.0 / 1.5.0）
- 下文所有行号均对应该基线；路径以仓库根为基准。

---

## Q1 版本与 Python 3.12 兼容性

**结论：最新 tag 4.5.0；`requires-python = ">=3.10"`，官方 classifier 明确列出 3.12 与 3.13，uv 用 Python 3.12 管理完全没问题。**

证据 `pyproject.toml`（vnpy 仓库根）：

```toml
requires-python = ">=3.10"
classifiers = [
    ...
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Programming Language :: Python :: 3.13",
]
dependencies = [
    "tzlocal>=5.3.1", "PySide6==6.8.2.1", "pyqtgraph>=0.13.7", "qdarkstyle>=3.2.3",
    "numpy>=2.2.3", "pandas>=2.2.3", "ta-lib>=0.6.4", "deap>=1.4.2", "pyzmq>=26.3.0",
    "plotly>=6.0.0", "tqdm>=4.67.1", "loguru>=0.7.3", "nbformat>=5.10.4",
    "requests>=2.32.0", "qrcode>=7.4.2"
]
```

`vnpy_ctastrategy/pyproject.toml`：

```toml
requires-python = ">=3.10"   # classifiers 同样含 3.12/3.13
dependencies = ["vnpy>=4.4.0", "pandas", "plotly"]
```

注意点（部署侧）：
1. **vnpy 4.x 是 numpy 2.x 代码**（`numpy>=2.2.3`），不要降到 numpy 1.x。
2. **`ta-lib>=0.6.4` 是硬依赖**：`vnpy/trader/utility.py:16` 顶层 `import talib`，即使纯回测不画图也要装 TA-Lib（0.6.x 起官方发布 cp312 wheel，macOS/Linux 均可直接 pip 装）。
3. `vnpy` 元包仍把 `PySide6/pyqtgraph/qdarkstyle` 列为必装依赖（GUI 框架），但**代码层面 GUI 全部隔离在 `vnpy/trader/ui/` 与 `vnpy_ctastrategy/ui/`，import 回测链路不会触发 PySide6 导入**；无 GUI 服务可以照常安装（多占磁盘），或自行 `--no-deps` 裁剪。
4. 版本号定义：`vnpy/__init__.py:34` `__version__ = "4.5.0"`；`vnpy_ctastrategy/__init__.py` `__version__ = "1.5.0"`。

---

## Q2 vnpy/trader 核心模块清单

目录证据：`vnpy/trader/`（4.5.0 实际文件）＝ `app.py, constant.py, converter.py, database.py, datafeed.py, engine.py, event.py, gateway.py, logger.py, object.py, optimize.py, setting.py, utility.py, wechat.py, locale/, ui/`。

| 模块 | 一句话职责 |
|---|---|
| `event_engine`（独立包 `vnpy/event/engine.py`） | 定时器 + 队列的事件分发线程（`class EventEngine`，纯标准库 threading/queue），实盘推送用 |
| `engine.py` | `MainEngine`（平台总控：组装 gateway/app/engine，`vnpy/trader/engine.py:89`）及 LogEngine/OmsEngine/EmailEngine 等功能引擎 |
| `gateway.py` | `BaseGateway` 抽象：对接外部交易/行情通道（on_tick/on_order/on_trade/on_account 等回调约定） |
| `object.py` | 全部数据对象 dataclass：`BarData/TickData/OrderData/TradeData/PositionData/AccountData/ContractData` + 各类 Request |
| `datafeed.py` | `BaseDatafeed` 抽象 + `get_datafeed()`：按全局配置动态 import `vnpy_<name>` 数据服务 |
| `database.py` | `BaseDatabase` 抽象 + `get_database()`：按全局配置动态 import `vnpy_<name>` 数据库驱动，回测数据从这里读 |
| `utility.py` | 工具箱：`BarGenerator`（分钟/小时/日 K 合成）、`ArrayManager`（定长数组 + talib 指标）、round_to、vt_setting 读写等 |
| `constant.py` | 枚举：`Direction/Offset/Status/Product/OrderType/Exchange/Interval` 等 |
| `setting.py` | 全局配置 `SETTINGS`，从 `~/.vntrader/vt_setting.json` 加载 |
| `optimize.py` | 参数穷举/遗传优化（`run_bf_optimization/run_ga_optimization`，multiprocessing） |
| `converter.py` | 实盘平今/锁仓拆单（`PositionHolding`），仅实盘下单路径用 |

**BarData 字段**（`vnpy/trader/object.py:87-108`）：

```python
@dataclass
class BarData(BaseData):
    symbol: str
    exchange: Exchange
    datetime: Datetime
    interval: Interval | None = None
    volume: float = 0
    turnover: float = 0
    open_interest: float = 0
    open_price: float = 0
    high_price: float = 0
    low_price: float = 0
    close_price: float = 0
    # __post_init__ 里生成 self.vt_symbol = f"{symbol}.{exchange.value}"
```

**Interval 枚举**（`vnpy/trader/constant.py:152-160`）：

```python
class Interval(Enum):
    MINUTE = "1m"
    HOUR = "1h"
    DAILY = "d"      # ← 存在
    WEEKLY = "w"     # ← 4.x 新增
    TICK = "tick"
```

**确认：`Interval.DAILY` 存在，且另有 `WEEKLY`。** 这与 3.x（只有 MINUTE/HOUR/TICK）相比是关键变化，说明 4.x 官方数据链路已把日 K 当一等公民（tushare 数据源 `INTERVAL_VT2TS` 里有 `Interval.DAILY: "D"`）。

---

## Q3 BacktestingEngine：程序化最小调用序列、统计键、参数、撮合时点

文件：`vnpy_ctastrategy/backtesting.py`（1294 行，`class BacktestingEngine` 从 48 行起）。

### 3.1 最小程序化调用序列（与官方优化入口 `evaluate()` 完全一致）

`backtesting.py:1184-1224` 的 `evaluate()` 就是官方给出的无 GUI 标准序列：

```python
engine: BacktestingEngine = BacktestingEngine()
engine.set_parameters(
    vt_symbol=vt_symbol, interval=interval, start=start,
    rate=rate, slippage=slippage, size=size, pricetick=pricetick,
    capital=capital, end=end, mode=mode,
)
engine.add_strategy(strategy_class, setting)
engine.load_data()
engine.run_backtesting()
engine.calculate_result()
statistics: dict = engine.calculate_statistics(output=False)
```

`set_parameters` 完整签名（`backtesting.py:116-131`）：

```python
def set_parameters(
    self,
    vt_symbol: str,            # 如 "600036.SSE"
    interval: Interval,        # Interval.DAILY 可用
    start: datetime,
    rate: float,               # 手续费率（成交额比例）
    slippage: float,           # 滑点（绝对价差/股）
    size: float,               # 合约乘数（股票=1）
    pricetick: float,          # 最小变动价位
    capital: int = 0,          # ⚠️ 默认 0，必须显式传！
    end: datetime | None = None,   # 缺省 datetime.now()，且被改为 23:59:59
    mode: BacktestingMode = BacktestingMode.BAR,
    risk_free: float = 0,
    annual_days: int = 240,
    half_life: int = 120
) -> None:
```

`add_strategy(strategy_class, setting)`（157 行）直接实例化：`strategy_class(self, strategy_class.__name__, self.vt_symbol, setting)`。`run_backtesting()`（219 行）内部依序 `strategy.on_init() → inited=True → on_start() → trading=True → 逐 bar 调 new_bar()（先撮合后 on_bar）→ on_stop()`。可选收尾：`show_chart()`（plotly Figure，无 GUI 服务可不用或导出 html）。

### 3.2 `calculate_statistics()` 返回 dict 完整键清单（28 个，`backtesting.py:498-527` 原样逐条）

```
start_date, end_date, total_days, profit_days, loss_days,
capital, end_balance,
max_drawdown, max_ddpercent, max_drawdown_duration,
total_net_pnl, daily_net_pnl,
total_commission, daily_commission,
total_slippage, daily_slippage,
total_turnover, daily_turnover,
total_trade_count, daily_trade_count,
total_return, annual_return, daily_return,
return_std, sharpe_ratio, ewm_sharpe,
return_drawdown_ratio, rgr_ratio
```

**确认：没有 alpha、beta、信息比率（information_ratio）、年化波动率。** 与波动率最接近的是 `return_std`（对数日收益 std ×100，日频口径）；`sharpe_ratio`/`ewm_sharpe` 由 `risk_free`、`annual_days` 参与（415-421 行）；4.x 还新增了 `ewm_sharpe`（半衰期 `half_life=120` 的 EWM Sharpe）和 `rgr_ratio`（带偏度/峰度/CVaR 的复合收益风险比，`calc_rgr_ratio`，1249 行）。**alpha/beta/IR/年化波动率需自算**（拿 `daily_df` 的 `return` 列与基准对齐即可）。

另有 `calculate_result()` 返回 `daily_df`（`DataFrame`，index=date），列即 `DailyResult.__dict__`：`date, close_price, pre_close, trades, trade_count, start_pos, end_pos, turnover, commission, slippage, trading_pnl, holding_pnl, total_pnl, net_pnl`（`backtesting.py:1082-1154`），并额外派生 `balance/return/highlevel/drawdown/ddpercent` 列（355-366 行）——自算 alpha/beta/波动率直接用这个 df。

### 3.3 关键属性含义与默认值（`__init__`，54-96 行）

| 属性 | 默认值 | 含义 |
|---|---|---|
| `capital` | `1_000_000`，**但 `set_parameters(capital=0)` 默认覆盖为 0** | 起始资金；统计里 `balance = net_pnl.cumsum() + capital`（355 行），capital=0 会导致收益/回撤全废 → **必须显式传** |
| `rate` | 0 | 手续费率，按成交额计：`commission = volume*size*price*rate`（1150 行）；股票双边约 0.0003 量级 |
| `slippage` | 0 | 滑点为**绝对价差**，按股计：`slippage_cost = volume*size*slippage`（1147 行） |
| `size` | 1 | 合约乘数（股票填 1；期货填合约乘数），贯穿 pnl/turnover 计算 |
| `pricetick` | 0 | 最小变动价位，委托价 `round_to(price, pricetick)`（911 行）；股票 A 股 0.01 |
| `risk_free` | 0 | 年化无风险利率（小数），进 Sharpe |
| `annual_days` | 240 | 年化天数（年化收益与 Sharpe 用） |
| `half_life` | 120 | EWM Sharpe 半衰期 |
| `mode` | `BacktestingMode.BAR` | BAR/TICK 两模式 |
| `history_data` | `[]` | **普通 Python list**，回测回放的数据源（见 Q4） |
| `daily_results` | `{}` | `dict[date, DailyResult]` 逐日盯市结果 |

（策略侧的 `fixed_size` 不是引擎属性，见 Q5。）

### 3.4 撮合时点：**下一根 bar 的开盘价成交，当根 bar 产生的委托绝不当根成交**

`new_bar()`（666-675 行）顺序是**先撮合、后回调**：

```python
def new_bar(self, bar: BarData) -> None:
    self.bar = bar
    self.datetime = bar.datetime
    self.cross_limit_order()      # ← 先用本根 bar 撮合"上一根 on_bar 里发的单"
    self.cross_stop_order()
    self.strategy.on_bar(bar)     # ← 策略在本根收盘后发的新单，下一根才撮合
    self.update_daily_close(bar.close_price)
```

限价单撮合（688-760 行）：BAR 模式下 `long_cross_price = bar.low_price`、`short_cross_price = bar.high_price`、`long_best_price = short_best_price = bar.open_price`；成交价：

```python
if long_cross:
    trade_price = min(order.price, long_best_price)   # 买：min(委托价, 本根开盘价)
else:
    trade_price = max(order.price, short_best_price)  # 卖：max(委托价, 本根开盘价)
```

即：**on_bar(t) 收盘发出的限价单，在 t+1 根 bar 开盘时判断穿越（买单要求 limit ≥ t+1 的 low），成交价 = min(limit, t+1 开盘价)**。日频场景等价于「今日收盘出信号 → 次日开盘价成交」，正是日频策略的标准假设，无需改造。停止单类似（762-849 行，本地撮合：买入触发价 ≤ 当根 high，成交价 = max(触发价, 开盘价)）。注意 4.5.0 前后的 commit `5da04d9 "[Add] 锁定CTA回测撮合和本地停止单"` 表明回测撮合行为在 1.5.0 里刚被调整过，升级需重跑校准。

---

## Q4 回测数据装载：日频支持与绕过数据库直接喂数据

### 4.1 `load_data`/`load_bar` 完全支持 `Interval.DAILY`

- `load_data()`（164-217 行）用 `INTERVAL_DELTA_MAP[self.interval]` 做分段推进；`vnpy_ctastrategy/base.py:57-62`：

```python
INTERVAL_DELTA_MAP: dict[Interval, timedelta] = {
    Interval.TICK: timedelta(milliseconds=1),
    Interval.MINUTE: timedelta(minutes=1),
    Interval.HOUR: timedelta(hours=1),
    Interval.DAILY: timedelta(days=1),   # ← 日频分片加载正常
}
```

- `set_parameters(interval=Interval.DAILY)` → `load_data()` → 每约 1/10 区间调一次 `load_bar_data(symbol, exchange, interval, start, end)`（模块级函数，1157-1168 行，带 `@lru_cache(999)`）→ `get_database().load_bar_data(...)`。日频数据从数据库按日取，无任何分钟假设。
- 策略初始化加载数据 `CtaTemplate.load_bar(days, interval=Interval.MINUTE, ...)`（template.py:292）在日频下要**显式传 `interval=Interval.DAILY`**（默认 MINUTE 会拉分钟数据，是日频回测第一个坑）。
- `vnpy.trader.utility.BarGenerator` 也支持合成日 K（`update_bar_daily_window`，444 行），但构造时必须传 `daily_end`（每日收盘时间），否则 `RuntimeError("合成日K线必须传入每日收盘时间")`（utility.py:205-206）。日频回测直接用日 bar 喂 `ArrayManager` 即可，不需要 BarGenerator。

### 4.2 内部 history 结构

`self.history_data: list = []`（80 行）——**纯 Python list[BarData]**，`load_data()` 里 `self.history_data.extend(data)`（209 行）。`run_backtesting()` 只做 `for data in self.history_data: func(data)`（239-248 行），回放前按总量分 10 批打印进度，**对 list 的来源零假设**。

### 4.3 绕过 vnpy 数据库直接喂 BarData 列表（三条可行路径，按推荐度排序）

**路径 A（最干净，推荐）：直接注入 `engine.history_data`，跳过 `load_data()`。**
`run_backtesting()` 只迭代 `self.history_data`，没有任何校验：

```python
from datetime import datetime
from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.object import BarData
from vnpy_ctastrategy.backtesting import BacktestingEngine

engine = BacktestingEngine()
engine.set_parameters("600036.SSE", Interval.DAILY, datetime(2022,1,1),
                      rate=3e-4, slippage=0.01, size=1, pricetick=0.01,
                      capital=1_000_000, end=datetime(2026,1,1))
engine.add_strategy(MyDailyStrategy, {})
# 你的 DataFrame -> BarData 列表（datetime 用交易日 00:00 或你自定义的 bar 时间）
engine.history_data = [
    BarData(symbol="600036", exchange=Exchange.SSE, datetime=dt,
            interval=Interval.DAILY, open_price=o, high_price=h,
            low_price=l, close_price=c, volume=v, turnover=amt,
            gateway_name="backtest_svc")
    for dt, o, h, l, c, v, amt in rows
]
engine.run_backtesting()
engine.calculate_result()
stats = engine.calculate_statistics(output=False)
```

注意：若策略 `on_init` 里调了 `self.load_bar(...)`，仍会走数据库；日频策略要么不调 `load_bar`、改为在 `on_init` 里手工回放 warmup（见路径 B 注入点），要么配合路径 B/C。

**路径 B：monkeypatch 模块级 `load_bar_data`。** `backtesting.py` 顶层 `from ... import` 后，`load_bar_data`/`load_tick_data` 是 `vnpy_ctastrategy.backtesting` 模块命名空间里的名字（1157-1181 行），直接替换即可拦截 `load_data()` 与策略 `load_bar()` 两条路：

```python
import vnpy_ctastrategy.backtesting as bt
bt.load_bar_data = lambda symbol, exchange, interval, start, end: my_bars
```

**路径 C：注入伪数据库对象（最小侵入、影响面全局）。** `get_database()`（`vnpy/trader/database.py:143-165`）优先返回模块级单例：

```python
database: BaseDatabase | None = None

def get_database() -> BaseDatabase:
    global database
    if database:
        return database
    ...
```

所以服务启动时 `import vnpy.trader.database as db; db.database = MyParquetDB()`，之后所有回测的 `load_bar_data` 都会落到你的实现（只需实现 `load_bar_data/load_tick_data/save_*/delete_*/get_*_overview` 8 个方法；自己喂全量时可让 `load_bar_data` 从内存/parquet 切片返回 `list[BarData]`）。注意 `load_bar_data` 有 `@lru_cache(999)`，同一 (symbol, exchange, interval, start, end) 参数不会二次穿透，切库后要记得 `cache_clear()`。

### 4.4 日频回测已知坑（代码级）

1. **`capital` 默认 0**（3.3 节）：不传则收益/回撤/Sharpe 全为 0 或爆仓提示，这是最常见的"回测结果全是 0"根因。
2. **`load_bar` 默认 MINUTE**（template.py:295）：日频策略 `on_init` 必须写 `self.load_bar(20, Interval.DAILY)`；且 `BacktestingEngine.load_bar` 的初始化窗口 `[start - days, start - INTERVAL_DELTA_MAP[interval]]`（862 行）要求**回测 start 之前在数据里留出 warmup 天数**。
3. **时区**：数据库写入走 `convert_tz`（database.py:21-26，转 `database.timezone`，默认本机时区），SQLite 读取再按 `DB_TZ` 还原（sqlite_database.py:378）。日 bar datetime 建议统一用**交易日 00:00 的 naive datetime**，并保持写入/读取两端 `vt_setting.json` 的 `database.timezone` 一致；跨机器部署时把 timezone 固定写死，避免"少一天/错一天"。
4. **分段加载边界**：`load_data` 每段结束后 `start = end + interval_delta`（214 行），DAILY 即 +1 天；若你的日 bar datetime 不是 00:00 整点（如带 15:00），分片边界可能漏 bar——**用 00:00 时间戳存日 K 最稳**（BarGenerator 日 K 合成也是 `replace(hour=0,...)`，utility.py:478-483）。
5. **`end` 被强改为 23:59:59**（150 行）：`end` 当天有 bar 会被包含，对日频意味着"end 交易日当天收盘价会参与回测但当天信号次日无成交"，服务端做区间裁剪时要意识到这一点。
6. **撮合在下一根开盘**（3.4 节）：日频的最后一天产生的信号永远不会成交（没有下一根），统计的 `end_balance` 不含未成交浮盈，属预期行为。
7. ** annualization 是单利**：`annual_return = total_return / total_days * annual_days`（410 行），非几何年化；对外展示口径要在服务层注明或自算 CAGR（`daily_df` 已给出 balance 序列）。
8. **只有单标的双向（含做空）撮合**：BacktestingEngine 单次只处理一个 `vt_symbol`；多标的组合回测需服务层多 engine 并行再汇总（`run_bf_optimization` 的多进程只用于参数寻优，不是组合回测）。

---

## Q5 CtaTemplate 策略模板、下单 API 与资金/持仓查询

文件：`vnpy_ctastrategy/template.py`（507 行，`class CtaTemplate(ABC)` 14 行起）。

### 5.1 声明方式与回调

- 参数与变量都是**类属性 + 字符串列表**（不是 dataclass）：

```python
class DoubleMaStrategy(CtaTemplate):
    author: str = "用Python的交易员"
    fast_window: int = 10        # 参数（可被 setting 覆盖）
    fast_ma0: float = 0.0        # 变量（运行状态）
    parameters: list[str] = ["fast_window", "slow_window"]
    variables: list[str] = ["fast_ma0", "fast_ma1", "slow_ma0", "slow_ma1"]
```

  构造时 `update_setting(setting)` 只会覆盖 `parameters` 列表里声明的键（template.py:46-53）；`variables` 会被自动前置插入 `inited/trading/pos`（39-42 行）。
- 回调：`on_init`（抽象，必须实现；常规做法在此建 `BarGenerator/ArrayManager` 并 `load_bar`）、`on_start/on_stop`、`on_tick/on_bar`、`on_order/on_trade/on_stop_order`（template.py:100-147）。
- 官方最小范例：`vnpy_ctastrategy/strategies/double_ma_strategy.py`（全文 120 行，见 Q6）。

### 5.2 buy/sell/short/cover 签名与默认撮合

```python
def buy(self,   price: float, volume: float, stop: bool = False,
        lock: bool = False, net: bool = False) -> list:   # 多开  LONG  + OPEN
def sell(self,  price: float, volume: float, stop: bool = False,
        lock: bool = False, net: bool = False) -> list:   # 空平  SHORT + CLOSE
def short(self, price: float, volume: float, stop: bool = False,
        lock: bool = False, net: bool = False) -> list:   # 空开  SHORT + OPEN
def cover(self, price: float, volume: float, stop: bool = False,
        lock: bool = False, net: bool = False) -> list:   # 多平  LONG  + CLOSE
```

（template.py:149-231）四者都转 `send_order(direction, offset, price, volume, stop, lock, net)`，只在 `self.trading=True` 时真正发给引擎，返回 `list[vt_orderid]`。默认 `stop=False` → 回测里全部是**限价单**（`BacktestingEngine.send_order`，899-916 行：`price=round_to(price, pricetick)` 后进 `send_limit_order`；`lock/net` 参数在回测引擎里被忽略——回测撮合只有本地限价/本地停止两类）。

### 5.3 下单量是否被引擎托管？

**没有 FixedSizeManager 这类东西。** 在 vnpy 4.5.0 与 vnpy_ctastrategy 1.5.0 全仓库 `grep -rn "FixedSizeManager|fixed_size"`：

- vnpy/trader 下 **0 命中**；
- vnpy_ctastrategy 下只命中示例策略自己的参数声明（如 `strategies/boll_channel_strategy.py:25 fixed_size: int = 1`、`strategies/turtle_signal_strategy.py:23`）。

即：**下单数量完全由策略自己计算并传入 `buy/sell/short/cover(price, volume)`**，引擎不托管仓位规模。实盘侧 `CtaEngine.send_order`（engine.py:470-503）也只做 `price=round_to(price, contract.pricetick); volume=round_to(volume, contract.min_volume)` 的取整 + 通过 `main_engine.convert_order_request`（converter.py 的 `PositionHolding`）拆平今/锁仓单，**不管数量多少的合规性**。策略里 `self.pos`（float）由引擎在成交时维护：回测 `cross_limit_order` 里 `self.strategy.pos += pos_change`（backtesting.py:757）。

### 5.4 回测中策略如何获知资金/持仓/现金（确切 API）

BacktestingEngine 提供给策略的可调用接口全集（strategy 通过 `self.cta_engine.*` 访问；backtesting.py:1012-1079）：

| API | 返回 | 说明 |
|---|---|---|
| `self.pos` | `float` | 当前净持仓（引擎成交回写，**这是唯一的官方持仓 API**） |
| `self.cta_engine.capital` | `int` | 起始资金（`set_parameters` 传入的值，**属性不是方法**） |
| `self.get_engine_type()` | `EngineType.BACKTESTING` | 区分回测/实盘 |
| `self.get_pricetick()` / `self.get_size()` | `float` | 最小变动价 / 合约乘数（backtesting.py:1039-1049） |
| `self.cta_engine.get_all_trades()` | `list[TradeData]` | 至今全部成交（1063 行） |
| `self.cta_engine.get_all_orders()` / `get_all_daily_results()` | list | 全部委托 / 逐日结果 |
| `self.cta_engine.datetime` | `datetime` | 当前回放到的 bar 时间 |
| `self.cta_engine.bar` | `BarData` | 当前 bar |

**确认：回测引擎没有 `get_account`/`get_positions`/`get_balance` 之类的资金 API，也不产生 `AccountData`；"现金/权益"在回测过程中根本不存在，只在 `calculate_statistics` 里事后由 `balance = net_pnl.cumsum() + capital` 还原。** 因此「按总资金/剩余现金百分比买入」必须由策略自己维护权益估计，推荐做法（官方语义下最精确）：

```python
class PctSizeStrategy(CtaTemplate):
    parameters = ["pct"]
    variables = ["cash"]

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self._capital: float = float(getattr(self.cta_engine, "capital", 1_000_000))
        self.cash: float = self._capital          # 自管现金

    def on_bar(self, bar):
        target_value = self.cash * self.pct        # 或按总权益
        volume = int(target_value / bar.close_price / self.get_size())
        if volume <= 0:
            return
        orderids = self.buy(bar.close_price, volume)
        # 现金扣减放在 on_trade 里按实际成交价结算最准
        if orderids:
            self.cash -= volume * bar.close_price  # 预扣，on_trade 里校正

    def on_trade(self, trade: TradeData):
        amt = trade.price * trade.volume * self.get_size()
        if trade.direction == Direction.LONG:
            self.cash -= amt * (1 + self.fee_rate) + trade.volume * self.get_size() * self.slippage
        else:
            self.cash += amt * (1 - self.fee_rate) - trade.volume * self.get_size() * self.slippage
```

补充：与真实统计的一致性——引擎事后算的 `balance = capital + cumsum(net_pnl)`（`DailyResult.calculate_pnl`：`holding_pnl = start_pos*(close-pre_close)*size`、`trading_pnl = pos_change*(close-trade.price)*size`、`net_pnl = total_pnl - commission - slippage`，backtesting.py:1110-1154），策略内按同一口径自管 `cash` 即可保证「百分比仓位」与统计口径基本吻合（差别仅在手续费计提时点）。

---

## Q6 自带示例策略清单（`vnpy_ctastrategy/strategies/`）

| 文件 | 类 | 信号 | 备注 |
|---|---|---|---|
| `double_ma_strategy.py` | `DoubleMaStrategy` | SMA 快慢线金叉死叉 | **最佳起步模板**（120 行，含 load_bar/on_init 全套路） |
| `atr_rsi_strategy.py` | `AtrRsiStrategy` | ATR 通道 + RSI | `am.atr(array=True)` 用法 |
| `boll_channel_strategy.py` | `BollChannelStrategy` | 布林带 + CCI + ATR | 停止单（`stop=True`）用法 |
| `dual_thrust_strategy.py` | `DualThrustStrategy` | 日内区间突破 | 引用日前 N 日 range |
| `king_keltner_strategy.py` | `KingKeltnerStrategy` | 肯特纳通道（keltner）+ 移动止损 | 趋势跟踪样板 |
| `multi_signal_strategy.py` | `MultiSignalStrategy`（+`RsiSignal/CciSignal/MaSignal`） | 多信号合成 | **`CtaSignal` 与 `TargetPosTemplate` 用法样板** |
| `multi_timeframe_strategy.py` | `MultiTimeframeStrategy` | 5 分钟/15 分钟多周期 | **双 `BarGenerator` + 双 `ArrayManager` 嵌套合成样板** |
| `turtle_signal_strategy.py` | `TurtleSignalStrategy` | **唐奇安通道突破（donchian entry/exit）+ ATR 加仓**（134-162 行：`t = self.pos / self.fixed_size` 分档加仓） | 海龟参考实现 |
| `test_strategy.py` | `TestStrategy` | tick 计数触发 | 冒烟测试用 |

**turtle：有**（`turtle_signal_strategy.py`，donchian+ATR，类海龟）。**macd/kdj：无**——9 个示例中没有任何 MACD/KDJ 策略（全仓 grep 无命中）；但 `ArrayManager.macd()` 内置可直接用（见 Q7），KDJ 需自算。

---

## Q7 ArrayManager 指标能力与 KDJ 自算

文件：`vnpy/trader/utility.py:504-1295`（`class ArrayManager`，定长 `size=100` 环形数组，`update_bar` 满 `size` 后 `inited=True`）。

**内置指标（全部基于 talib，均带 `array: bool = False` 参数，False 返回最新值、True 返回全序列）：**

- 均线类：`sma, ema, kama, wma`
- 动量类：`apo, cmo, mom, ppo, roc, rocr, rocp, rocr_100, trix`
- 统计：`std(n, nbdev)`
- 量能：`obv, ad, adosc, mfi, bop`
- 摆动：`cci, willr, rsi, ultosc, dx, adx, adxr`
- 波动/通道：`atr, natr, trange, boll(n, dev)→(up, down), keltner(n, dev)→(up, down), donchian(n)→(up, down), aroon(n)→(up, down), aroonosc, minus_dm, plus_dm, minus_di, plus_di, sar`
- MACD：`macd(fast_period, slow_period, signal_period) → (macd, signal, hist)`（899-917 行，talib.MACD）
- Stoch：`stoch(fastk_period, slowk_period, slowk_matype, slowd_period, slowd_matype) → (k, d)`（1254-1280 行，talib.STOCH）

原始数组属性：`open/high/low/close/volume/turnover/open_interest`（property，549-596 行）。

**KDJ 没有内置（grep "kdj" 全仓库 0 命中）。** 两条自算路径：

**路径 1：用内置 `stoch` 近似（matype=1 即 EMA 平滑，最接近国内 KDJ 的 SMA(X,3,1) 递推）：**

```python
k, d = am.stoch(9, 3, 1, 3, 1, array=True)
j = 3 * k - 2 * d
```

**路径 2：用原始数组精确实现国内口径（RSV → SMA(X,3,1) 递推）：**

```python
import numpy as np

def kdj(am, n=9, m1=3, m2=3):
    low = am.low; high = am.high; close = am.close
    llv = np.full_like(close, np.nan); hhv = np.full_like(close, np.nan)
    # 滚动窗口极值（可用 pandas rolling 或 talib.MIN/MAX）
    from talib import MIN, MAX
    llv = MIN(low, n); hhv = MAX(high, n)
    rsv = (close - llv) / np.where(hhv - llv == 0, 1e-10, hhv - llv) * 100
    # 国内 SMA(X,N,1)：Y = (X + (N-1)*Y') / N
    def sma_cn(x: np.ndarray, n: int) -> np.ndarray:
        y = np.zeros_like(x); ok = ~np.isnan(x)
        first = np.argmax(ok)
        y[first] = x[first]
        for i in range(first + 1, len(x)):
            y[i] = (x[i] + (n - 1) * y[i - 1]) / n
        y[~ok] = np.nan
        return y
    k = sma_cn(np.nan_to_num(rsv, nan=50.0), m1)
    d = sma_cn(k, m2)
    j = 3 * k - 2 * d
    return k, d, j
```

注意：`ArrayManager.size` 默认 100，日频策略若指标窗口大（如年线）要显式 `ArrayManager(size=250)`；`sma_cn` 的递推与 talib 无对应（talib.STDDEV/SMA 是普通滚动），KDJ 用路径 1 的误差在稳态下很小、前几十根有差异，如需严格对齐通达信口径用路径 2。

---

## Q8 数据源接口（BaseDatafeed）与社区 yahoo 数据源

**接口**（`vnpy/trader/datafeed.py:14-37`）：

```python
class BaseDatafeed:
    def init(self, output: Callable = print) -> bool: ...
    def query_bar_history(self, req: HistoryRequest, output: Callable = print) -> list[BarData]: ...
    def query_tick_history(self, req: HistoryRequest, output: Callable = print) -> list[TickData]: ...
```

**注册/发现机制**（`get_datafeed()`，43-74 行）：全局配置 `SETTINGS["datafeed.name"]`（来自 `~/.vntrader/vt_setting.json`，见 `setting.py:27`）→ `import_module(f"vnpy_{datafeed.name}")` → 实例化 `module.Datafeed()`。即社区数据源就是「一个暴露 `Datafeed` 类的 `vnpy_xxx` 包」。官方参考实现 `vnpy_tushare`：`__init__.py` 里 `from .tushare_datafeed import TushareDatafeed as Datafeed`；token 从 `SETTINGS["datafeed.password"]` 读；`INTERVAL_VT2TS = {MINUTE: "1min", HOUR: "60min", DAILY: "D"}`（支持日频）。

**重要边界：`BacktestingEngine` 完全不使用 datafeed**——回测数据只来自 `get_database()`（backtesting.py:26、1166）。datafeed 只服务于 DataManager/数据落地（datafeed → `database.save_bar_data` → 回测读库）。所以本服务的数据链路建议：自建抓取（如 yfinance）→ `save_bar_data` 入库 → 回测；datafeed 层可不做。

**社区 yahoo 数据源现状（2026-10-20 实测）：**
- PyPI：`vnpy_yahoofinance`、`vnpy_yfinance` 均 **404 不存在**（`https://pypi.org/pypi/<pkg>/json` 实测）；存在的官方系数据源包：`vnpy_tushare`、`vnpy_udata`、`vnpy_mysql`、`vnpy_sqlite`、`vnpy_influxdb` 等。
- GitHub：`api.github.com/search/repositories?q=vnpy+yahoo` 与 `q=vnpy_yahoofinance`、`q=vnpy+yfinance` 均 **0 结果**；vnpy 官方 org 的数据源仓库列表：`vnpy_datamanager, vnpy_datarecorder, vnpy_ifind, vnpy_mcdata, vnpy_rqdata, vnpy_tushare, vnpy_udata, vnpy_wind, vnpy_xt, vnpy_xtp`（无 yahoo）。
- 结论：**不存在可直接复用、兼容 4.x 的 vnpy_yahoofinance addon**。如需 Yahoo 数据，自己写 ~40 行的抓取脚本（yfinance → BarData → `get_database().save_bar_data(bars)`）比造一个 BaseDatafeed 更省事；若坚持 datafeed 形态，按 `vnpy_tushare` 的类结构实现 `query_bar_history` 即可（注意 yfinance 的日 K datetime 要转成交易日 00:00 naive datetime，见 Q4 时区坑）。

---

## Q9 纯回测服务能否完全绕开 EventEngine/MainEngine/Gateway

**结论：可以，BacktestingEngine 是自包含的。**

证据 1——`backtesting.py` 的完整 import 面（1-45 行）：只 import 了 `vnpy.trader.constant / database / object / utility / optimize` + 本包 `.base / .template / .locale`；**没有任何 `vnpy.event`、`vnpy.trader.engine`、`gateway` 导入**。`BacktestingEngine.__init__`（54 行）不接收也不创建任何引擎/线程；所谓 engine 只是被策略当 "cta_engine" 引用的普通对象，其被调用的方法（`send_order/cancel_order/write_log/load_bar/get_engine_type/get_pricetick/get_size/put_strategy_event/sync_strategy_data/send_notification`）全部在 BacktestingEngine 内实现，其中 GUI/事件相关的 `put_strategy_event`、`sync_strategy_data`、`send_notification` 直接是 `pass`（1019-1055 行）。

证据 2——策略模板 `template.py` 的 import 也只有 `vnpy.trader.constant/object` + `.base`（1-11 行），`self.cta_engine: Any` 是鸭子类型。

证据 3——实盘引擎 `CtaEngine`（engine.py:71，继承 `BaseEngine`，构造需要 `main_engine, event_engine`）**只有 `import vnpy_ctastrategy` 包 `__init__.py` 时才会被加载**（`__init__.py` 顶层 `from .engine import CtaEngine`）；`vnpy.event.EventEngine` 本身也是纯标准库（threading+queue，event/engine.py:5-10），即便被 import 也不会启动线程（只有 `main_engine.event_engine.start()` 才启动）。要最严格的无副作用加载，服务层直接 `from vnpy_ctastrategy.backtesting import BacktestingEngine` + `from vnpy_ctastrategy.template import CtaTemplate`，不 import `vnpy_ctastrategy` 包顶层。

证据 4——真正涉及 GUI 的 `vnpy/trader/ui/`（PySide6）与 `vnpy_ctastrategy/ui/` 只被 widget 入口引用，回测链路无任何 import。

**遗留依赖提醒：** 即使无 GUI，import 链上必然加载 `talib`（vnpy/trader/utility.py:16）与 `vnpy.trader.setting`（读 `~/.vntrader/vt_setting.json`，不存在则用默认值，不报错）；`vnpy.trader.database.get_database()` 若未注入自定义实现，会尝试 `import vnpy_sqlite`，找不到则打印提示并失败——所以服务容器里要么装 `vnpy_sqlite`，要么走 Q4 路径 A/C。另外 `MainEngine.__init__` 会 `os.chdir(TRADER_DIR)`（engine.py:107），**纯回测服务只要不创建 MainEngine 就不会被改工作目录**，FastAPI 服务可放心用相对路径外的绝对路径管理数据。

---

## 附：对本服务设计的最直接推论

1. 技术栈：Python 3.12（uv）+ `vnpy==4.5.0` + `vnpy_ctastrategy==1.5.0` + `vnpy_sqlite`（或自定义 DB 注入）+ FastAPI；TA-Lib 是必装系统依赖。
2. 回测执行器照抄 `evaluate()` 六步序列；每日频 K 线 `set_parameters(interval=Interval.DAILY)`；`capital` 必传。
3. 数据面推荐「自建抓取 → BarData → 注入 `history_data`（Q4 路径 A）或实现 `BaseDatabase` 注入（路径 C）」，完全跳过 datafeed。
4. 统计面：`calculate_statistics` 的 28 键直接透传 API；alpha/beta/IR/年化波动率在服务层用 `daily_df["return"]` 自算。
5. 策略面：用户策略继承 `CtaTemplate`；「百分比仓位」用 5.4 节的自管 cash 方案（唯一官方持仓 API 是 `self.pos`，资金初始值读 `self.cta_engine.capital`）。
