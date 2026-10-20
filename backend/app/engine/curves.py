# app/engine/curves.py
"""每日净值导出:equity=capital+cumsum(net_pnl);pos 由成交按日重放;cash=equity-持仓市值。

引擎结构(1.4.1 backtesting.py 内省+实测):
- ``daily_results: dict[Date, DailyResult]`` 键为 ``datetime.date``(:93;new_bar 每根 bar
  经 update_daily_close :641-647 建条目,故逐 bar 一条),``DailyResult.net_pnl/.close_price``
  存在(:1056-1078),holding PnL 按收盘盯市 → cash=equity-pos*close 与策略台账精确一致。
- 成交重放用 ``t.datetime.date()``(TradeData 无 .time 字段,vnpy/trader/object.py:154-175)。
"""
from collections import defaultdict
from dataclasses import dataclass, field

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData

from app.engine.runner import BacktestRun


@dataclass
class Curves:
    dates: list[str] = field(default_factory=list)
    equity: list[float] = field(default_factory=list)
    position_value: list[float] = field(default_factory=list)
    cash: list[float] = field(default_factory=list)


def build_curves(run: BacktestRun, bars: list[BarData], capital: float) -> Curves:
    engine = run.engine
    # 每日收盘价(直接用 bar,与引擎 daily_results 的 close_price 同源:update_daily_close(bar.close_price))
    closes = {b.datetime.date(): b.close_price for b in bars}
    dates = [b.datetime.strftime("%Y-%m-%d") for b in bars]

    daily_pnl = defaultdict(float)
    for date, res in engine.daily_results.items():
        daily_pnl[date] = res.net_pnl

    net_pnl = [daily_pnl.get(b.datetime.date(), 0.0) for b in bars]
    equity: list[float] = []
    acc = capital
    for pnl in net_pnl:
        acc += pnl
        equity.append(acc)

    pos_delta = defaultdict(int)
    for t in engine.get_all_trades():
        d = t.volume if t.direction == Direction.LONG else -t.volume
        pos_delta[t.datetime.date()] += d
    pos = 0
    position_value: list[float] = []
    for b in bars:
        pos += pos_delta.get(b.datetime.date(), 0)
        position_value.append(pos * closes[b.datetime.date()])

    cash = [eq - pv for eq, pv in zip(equity, position_value)]
    return Curves(dates=dates, equity=equity, position_value=position_value, cash=cash)
