# tests/strategies/test_turtle.py
"""经典海龟策略测试:突破 t+1 入场、ATR 单位折算(手算 oracle)、满仓退出、现金守恒。"""
import math

import pytest
from vnpy.trader.constant import Direction

from app.engine.runner import CostSettings, run_backtest
from app.strategies.turtle import TurtleStrategy
from tests.fixtures.synth import make_bars

CAPITAL = 1_000_000.0

PARAMS = {"entry_days": 20, "exit_days": 10, "atr_days": 14, "risk_pct": 1.0, "max_units": 4, "am_size": 60}


def bars_breakout_then_breakdown() -> list:
    # 60 根 100 横盘 → 20 根 +2/根 上涨(第 61 根即突破 20 日高)→ 20 根 -5/根 暴跌
    flat = [100.0] * 60
    up = [100 + i * 2 for i in range(1, 21)]
    down = [140 - (i + 1) * 5 for i in range(20)]
    return make_bars(flat + up + down)


def wilder_atr_at(bars: list, n: int, upto: int) -> float:
    """手算 bars[:upto+1] 的 Wilder ATR(n)(入场点 oracle,不依赖 talib)。

    make_bars 的 OHLC 规则:o=昨收、high=round(max(o,c)*1.01,2)、low=round(min(o,c)*0.99,2)。
    talib.ATR 首值 = 前 n 个 TR 的 SMA,此后 ATR=(prev*(n-1)+TR)/n;已实测与 talib 逐位一致。
    """
    trs = [
        max(
            bar.high_price - bar.low_price,
            abs(bar.high_price - bars[j - 1].close_price),
            abs(bar.low_price - bars[j - 1].close_price),
        )
        for j, bar in enumerate(bars[1 : upto + 1], start=1)
    ]
    atr = sum(trs[:n]) / n
    for tr in trs[n:]:
        atr = (atr * (n - 1) + tr) / n
    return atr


def test_breakout_entry_next_open() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    assert trades, "突破 20 日高应触发买入"
    # brief 原文 direction.value == 1 不成立:vnpy Direction 枚举值为中文串,直接比枚举
    assert trades[0].direction == Direction.LONG
    assert trades[0].volume >= 1
    # t+1 开盘成交:决策 bar idx 60(close 102 > 昨日 20 日高 101),成交在 idx 61 open=102
    assert trades[0].datetime == bars[61].datetime
    assert trades[0].price == pytest.approx(bars[61].open_price)


def test_unit_size_uses_atr() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    buy = run.engine.get_all_trades()[0]
    # brief 原断言:下取整特征 + 上界(保留)
    assert buy.volume == math.floor(buy.volume) and buy.volume <= CAPITAL * 0.01 / 0.5
    # 强断言(oracle 夹逼→精确):入场 bar idx 60 的 ATR 手算 = 30.02/14 ≈ 2.1442857
    # (横盘段 TR≡2.0,入场 bar high=103.02/low=99.0/昨收 100 → TR=4.02,
    #  ATR=(2.0*13+4.02)/14;已实测与 talib.atr 逐位一致)→ unit=floor(1e6*1%/2.1442857)=4663
    atr_est = wilder_atr_at(bars, PARAMS["atr_days"], 60)
    assert buy.volume == math.floor(CAPITAL * (PARAMS["risk_pct"] / 100.0) / atr_est)
    assert buy.volume == 4663


def test_stop_loss_full_exit() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    # brief 原文 direction.value == 1/2 不成立:直接比枚举
    buys = sum(t.volume for t in trades if t.direction == Direction.LONG)
    sells = sum(t.volume for t in trades if t.direction == Direction.SHORT)
    assert buys == sells, "暴跌段应全仓退出(买入总量 == 卖出总量)"
    assert run.engine.strategy.pos == 0
    assert not run.engine.active_stop_orders, "退出后不得残留 stop 单"


def test_cash_conservation() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    st = run.engine.strategy
    expected = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * bars[-1].close_price
    assert st.cash == pytest.approx(expected, abs=1e-6)


def test_2n_stop_pierced_by_huge_down_bar() -> None:
    """2N 总止损路径:巨阴 low 击穿 entry−2N、close 仍高于 10 日低点(避开通道离场),
    同 bar stop 段撮合(on_trade 挂单后 stop 快照继续遍历,backtesting.py:649-656),
    成交价 = min(stop_price, bar.open) = stop_price 本身(stop 语义 backtesting.py:795-798)。

    数据:51 横盘@100 → 5 根回调@97(压低 10 日低点与 ATR)→ 4 根回 100 → 102(突破入场)
    → 98(巨阴:o=102、low=97.02 ≤ stop,close=98 > 回调段 10 日低点)。
    """
    closes = [100.0] * 51 + [97.0] * 5 + [100.0] * 4 + [102.0, 98.0]
    bars = make_bars(closes)
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    assert len(trades) == 2, "应恰为一买一 stop 卖"
    buy, sell = trades
    assert buy.direction == Direction.LONG and sell.direction == Direction.SHORT
    # 入场决策 bar = idx 60(close 102 > 20 日高 101);stop 用该 bar ATR(含回调段 TR)手算
    atr = wilder_atr_at(bars, PARAMS["atr_days"], 60)
    stop_price = round(102.0 - 2.0 * atr, 2)  # stop_n 类默认 2.0(PARAMS 未覆盖)
    assert buy.price == pytest.approx(bars[61].open_price)
    assert bars[61].low_price <= stop_price, "巨阴 low 必须击穿 entry-2N"
    assert bars[61].close_price > 96.03, "close 须高于 10 日低点以避开通道离场"
    assert sell.price == pytest.approx(min(stop_price, bars[61].open_price))
    assert sell.price == pytest.approx(stop_price)  # stop < open → 成交价即 stop 本身
    assert run.engine.strategy.pos == 0


def test_entry_unit_capped_by_cash() -> None:
    """现金不足时买入股数受现金硬约束(floor(cash/price)),不足 1 股不买。"""
    from datetime import datetime, timedelta

    from tests.fixtures.synth import make_bar

    # 小波动率(高=101.0/低=99.0 窄幅)使 ATR 单元需求远超现金
    closes = [100.0] * 60 + [100 + i for i in range(1, 21)]
    bars = []
    day = datetime(2023, 1, 2)
    prev = closes[0]
    for i, c in enumerate(closes):
        o = prev
        h = round(max(o, c) * 1.001, 2)
        l = round(min(o, c) * 0.999, 2)
        bars.append(make_bar(day, o, h, l, c))
        prev = c
        day += timedelta(days=1)

    capital = 20_000.0
    run = run_backtest(bars, TurtleStrategy, {"entry_days": 20, "exit_days": 10, "atr_days": 14, "am_size": 60}, capital, CostSettings())
    buys = [t for t in run.engine.get_all_trades() if t.direction == Direction.LONG]
    assert buys, "突破后应有买入"
    first_open = bars[61].open_price  # 突破 bar 的下一根开盘价(实际成交价)
    assert buys[0].volume == int(capital // first_open), "买入股数应受现金硬约束"
