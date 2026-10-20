"""经典海龟(做多 only):唐奇安突破入场、ATR 单位加仓、2N 总止损、通道反向离场。"""
from typing import ClassVar

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager
from vnpy_ctastrategy import CtaTemplate, TradeData


class TurtleStrategy(CtaTemplate):
    """突破开多,unit=floor(equity*risk_pct%/ATR);加仓以新 2N 止损重建,通道下破全平。"""

    author = "noire02qwq"
    parameters: ClassVar[list[str]] = [
        "entry_days",
        "exit_days",
        "atr_days",
        "risk_pct",
        "max_units",
        "add_on_n",
        "stop_n",
        "am_size",
    ]
    variables: ClassVar[list[str]] = ["pos", "cash", "units", "stop_price"]

    entry_days = 20
    exit_days = 10
    atr_days = 14
    risk_pct = 1.0
    max_units = 4
    add_on_n = 0.5
    stop_n = 2.0
    am_size = 100

    cash = 0.0
    units = 0
    stop_price = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        # update_setting 已在 super().__init__ 内应用 setting,am_size 此时已是实参值
        self.am = ArrayManager(size=max(self.am_size, self.entry_days * 2 + 10))
        self.last_entry_price = 0.0
        self.entry_atr = 0.0

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def on_bar(self, bar: BarData) -> None:
        am = self.am
        am.update_bar(bar)
        if not am.inited:
            return
        # vnpy 4.5 donchian/atr 默认(array=False)只回末值标量,取 [-2] 昨日通道须 array=True
        entry_up, _ = am.donchian(self.entry_days, array=True)
        _, exit_low = am.donchian(self.exit_days, array=True)
        atr = float(am.atr(self.atr_days, array=True)[-1])
        entry_up_prev = float(entry_up[-2])
        exit_low_prev = float(exit_low[-2])
        equity = self.cash + abs(self.pos) * bar.close_price

        if self.pos == 0 and bar.close_price > entry_up_prev:
            unit = int(equity * (self.risk_pct / 100.0) / max(atr, 1e-9))
            if unit > 0:
                self.units = 1
                self.last_entry_price = bar.close_price
                self.entry_atr = atr
                self.stop_price = round(bar.close_price - self.stop_n * atr, 2)
                self.buy(round(bar.close_price * 1.05, 2), unit)
        elif (
            0 < self.units < self.max_units
            and bar.close_price >= self.last_entry_price + self.add_on_n * self.entry_atr
        ):
            unit = int(equity * (self.risk_pct / 100.0) / max(atr, 1e-9))
            if unit > 0:
                self.units += 1
                self.last_entry_price = bar.close_price
                self.stop_price = round(bar.close_price - self.stop_n * atr, 2)
                self.cancel_all()
                self.buy(round(bar.close_price * 1.05, 2), unit)
        elif self.pos > 0 and bar.close_price < exit_low_prev:
            self.cancel_all()
            self.units = 0
            self.sell(round(bar.close_price * 0.95, 2), abs(self.pos))

    def on_trade(self, trade: TradeData) -> None:
        cost = trade.price * trade.volume
        # 1.4.1 引擎无 fixed 参数,守卫取 0.0,成本模型退化为 rate-only
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        # 引擎 net_pnl 扣双边滑点(backtesting.py:1119)而成交价不含滑点(限价 :722-725、
        # stop :795-798),现金账本记同一笔才能与引擎台账精确对齐;getattr 防御无属性引擎
        slip = trade.volume * getattr(self.cta_engine, "size", 1) * getattr(self.cta_engine, "slippage", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee + slip
            # 2N 总止损跟随最新 entry:首笔成交后挂全仓 stop;加仓成交后以新 stop_price 重建
            if self.units >= 1 and abs(self.pos) > 0:
                self.cancel_all()
                self.sell(self.stop_price, abs(self.pos), stop=True)
        else:
            self.cash += cost - fee - slip
            self.units = 0
            self.stop_price = 0.0
            self.cancel_all()
        self.put_event()
