"""金叉买入 + 固定百分比止盈(限价卖单,日频跳空以 max(TP, open) 成交)与止损(stop 卖单)。死叉为兜底出场。"""
from typing import ClassVar

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager
from vnpy_ctastrategy import CtaTemplate, TradeData

from app.strategies.signals import signal_direction
from app.strategies.sizing import plan_shares


class CrossTpslStrategy(CtaTemplate):
    """金叉开多,成交后挂止盈限价 + 止损 stop 双单;任一成交或死叉即撤单清仓。"""

    author = "noire02qwq"
    parameters: ClassVar[list[str]] = [
        "signal_kind",
        "fast_period",
        "slow_period",
        "signal_period",
        "kdj_n",
        "kdj_m1",
        "kdj_m2",
        "entry_pct",
        "entry_basis",
        "take_profit_pct",
        "stop_loss_pct",
        "am_size",
    ]
    variables: ClassVar[list[str]] = ["pos", "cash", "entry_price"]

    signal_kind = "ema"
    fast_period = 5
    slow_period = 20
    signal_period = 9
    kdj_n = 9
    kdj_m1 = 3
    kdj_m2 = 3
    entry_pct = 100.0
    entry_basis = "cash"
    take_profit_pct = 10.0
    stop_loss_pct = 5.0
    am_size = 100

    cash = 0.0
    entry_price = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        # update_setting 已在 super().__init__ 内应用 setting,am_size 此时已是实参值
        self.am = ArrayManager(size=self.am_size)

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)
        self.entry_price = 0.0

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def _params(self) -> dict:
        return {
            "fast_period": self.fast_period,
            "slow_period": self.slow_period,
            "signal_period": self.signal_period,
            "kdj_n": self.kdj_n,
            "kdj_m1": self.kdj_m1,
            "kdj_m2": self.kdj_m2,
        }

    def on_bar(self, bar: BarData) -> None:
        am = self.am
        am.update_bar(bar)
        if not am.inited:
            return
        direction = signal_direction(self.signal_kind, am, self._params())
        if direction > 0 and self.pos == 0:
            base = (self.cash + abs(self.pos) * bar.close_price) if self.entry_basis == "total" else self.cash
            shares = plan_shares(base, self.entry_pct, bar.close_price, self.cash, self.entry_basis)
            if shares > 0:
                self.buy(round(bar.close_price * 1.05, 2), shares)
        elif direction < 0 and self.pos > 0:
            # 死叉兜底:先撤 TP/SL 残单再市价化限价清仓(下一根开盘附近成交)
            self.cancel_all()
            self.sell(round(bar.close_price * 0.95, 2), abs(self.pos))

    def on_trade(self, trade: TradeData) -> None:
        cost = trade.price * trade.volume
        # 1.4.1 引擎无 fixed 参数,守卫取 0.0,成本模型退化为 rate-only
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        # 引擎 net_pnl 扣双边滑点(backtesting.py:1119)而成交价不含滑点(限价 :720-723、
        # stop :795-798),现金账本记同一笔才能与引擎台账精确对齐;getattr 防御无属性引擎
        slip = trade.volume * getattr(self.cta_engine, "size", 1) * getattr(self.cta_engine, "slippage", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee + slip
            self.entry_price = trade.price
            vol = abs(self.pos)
            if vol > 0:
                tp = round(self.entry_price * (1 + self.take_profit_pct / 100.0), 2)
                sl = round(self.entry_price * (1 - self.stop_loss_pct / 100.0), 2)
                self.sell(tp, vol)  # 止盈限价卖单:bar.high >= tp 才成交,成交价 max(tp, open)
                self.sell(sl, vol, stop=True)  # 止损 stop 卖单:bar.low <= sl 触发,成交价 min(sl, open)
        else:
            self.cash += cost - fee - slip
            self.entry_price = 0.0
            # 任一出场成交即撤净对手单(TP 成交撤 SL、SL/死叉成交撤 TP),防零持仓误触发;
            # 引擎同 bar 先跑 cross_limit_order 后跑 cross_stop_order(backtesting.py:654-655),
            # 此处撤单发生在两段之间,可拦截残留 stop 单在同一根 bar 上继续撮合
            self.cancel_all()
        self.put_event()
