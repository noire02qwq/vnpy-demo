"""简单定投:每周期首个交易日按固定金额买入,持有到期不清仓。"""
import math
from datetime import datetime
from typing import ClassVar

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager
from vnpy_ctastrategy import CtaTemplate, TradeData


def period_key(dt: datetime, interval: str) -> tuple[int, int]:
    """周期锚定键:monthly=(年,月);weekly=ISO(年,周);biweekly=ISO(年, 周//2)。"""
    if interval == "monthly":
        return (dt.year, dt.month)
    iso = dt.isocalendar()
    if interval == "biweekly":
        return (iso[0], iso[1] // 2)
    return (iso[0], iso[1])  # weekly


class DcaStrategy(CtaTemplate):
    """每周期首个交易日 bar 定投固定金额;只买不卖,期末持仓不清仓。"""

    author = "noire02qwq"
    parameters: ClassVar[list[str]] = ["interval", "amount", "am_size"]
    variables: ClassVar[list[str]] = ["pos", "cash"]

    interval = "monthly"
    amount = 1000.0
    am_size = 100

    cash = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        # update_setting 已在 super().__init__ 内应用 setting,am_size 此时已是实参值
        self.am = ArrayManager(size=self.am_size)
        self._last_period = None

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def on_bar(self, bar: BarData) -> None:
        self.am.update_bar(bar)
        if not self.am.inited:
            return
        key = period_key(bar.datetime, self.interval)
        if key == self._last_period:
            return
        self._last_period = key
        # 现金硬约束:t+1 开盘价可能略高于决策收盘价,on_trade 校准后的现金不允许为负
        if self.cash < bar.close_price:
            return
        shares = math.floor(min(self.amount, self.cash) / bar.close_price)
        if shares > 0:
            self.buy(round(bar.close_price * 1.05, 2), shares)

    def on_trade(self, trade: TradeData) -> None:
        # DCA 只买不卖,SHORT 分支不可达;核算标准与 cross/turtle 统一(含双边滑点)
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
