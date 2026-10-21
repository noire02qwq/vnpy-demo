"""金叉买/死叉卖(信号源三选一)。现金自管,以 on_trade 实际回报校准。"""
from typing import ClassVar

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager
from vnpy_ctastrategy import CtaTemplate, TradeData

from app.strategies.signals import signal_direction
from app.strategies.sizing import plan_sell_shares, plan_shares


class CrossTradeStrategy(CtaTemplate):
    """金叉按比例开多(仅空仓时)、死叉按 sell_pct% 比例卖出;现金/持仓硬约束。"""

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
        "sell_pct",
        "am_size",
    ]
    variables: ClassVar[list[str]] = ["pos", "cash"]

    signal_kind = "ema"
    fast_period = 5
    slow_period = 20
    signal_period = 9
    kdj_n = 9
    kdj_m1 = 3
    kdj_m2 = 3
    entry_pct = 100.0
    entry_basis = "total"
    sell_pct = 100.0
    am_size = 100

    cash = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        # update_setting 已在 super().__init__ 内应用 setting,am_size 此时已是实参值
        self.am = ArrayManager(size=self.am_size)

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

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
            self.cancel_all()
            shares = plan_sell_shares(abs(self.pos), self.sell_pct)
            if shares < 1:
                return
            self.sell(round(bar.close_price * 0.95, 2), shares)

    def on_trade(self, trade: TradeData) -> None:
        cost = trade.price * trade.volume
        # 1.4.1 引擎无 fixed 参数,守卫取 0.0,成本模型退化为 rate-only
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        # 引擎 equity 按 net_pnl 扣双边滑点(1.4.1 backtesting.py:1119)而成交价不含滑点
        # (:722-725),现金账本记同一笔才能与引擎台账任意成本设置下精确对齐;
        # getattr 防御无 size/slippage 属性的实盘引擎
        slip = trade.volume * getattr(self.cta_engine, "size", 1) * getattr(self.cta_engine, "slippage", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee + slip
        else:
            self.cash += cost - fee - slip
        self.put_event()
