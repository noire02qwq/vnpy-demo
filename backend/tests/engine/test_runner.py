# tests/engine/test_runner.py
"""引擎驱动链路测试:最小策略验证 BacktestingEngine 无 GUI 驱动。"""
from typing import ClassVar

from vnpy_ctastrategy import CtaTemplate

from tests.fixtures.synth import linear_closes, make_bars


class BuyOnceStrategy(CtaTemplate):
    author = "test"
    parameters: ClassVar[list[str]] = ["am_size"]
    variables: ClassVar[list] = []
    am_size = 10
    entries = 0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self.bought = False
        self.trades: list = []

    def on_init(self) -> None:
        self.write_log("init")

    def on_bar(self, bar) -> None:
        if not self.bought and bar.close_price > 105:
            self.buy(round(bar.close_price * 1.05, 2), 1)
            self.bought = True

    def on_trade(self, trade) -> None:
        self.trades.append(trade)


def test_runner_drives_engine() -> None:
    from app.engine.runner import CostSettings, run_backtest

    bars = make_bars(linear_closes(30))
    run = run_backtest(bars, BuyOnceStrategy, {"am_size": 10}, capital=100_000.0, cost=CostSettings())
    assert run.stats["total_trade_count"] == 1
    assert len(run.engine.get_all_trades()) == 1
    trade = run.engine.get_all_trades()[0]
    assert trade.volume == 1
    # t+1 开盘成交:买点出现在价格>105 的 bar 的下一根
    # (brief 原文 trade.time 不存在:TradeData 只有 datetime,无 time 字段)
    idx = next(i for i, b in enumerate(bars) if b.close_price > 105)
    assert trade.datetime.date() == bars[idx + 1].datetime.date()
