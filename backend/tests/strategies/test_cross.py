# tests/strategies/test_cross.py
"""金死叉策略行为测试:t+1 开盘建仓、死叉全仓退出、现金守恒、预热期零交易。"""
import numpy as np
import pytest
from vnpy.trader.constant import Direction

from app.engine.runner import CostSettings, run_backtest
from app.strategies.cross import CrossTradeStrategy
from app.strategies.signals import cross_direction, ema_series
from tests.fixtures.synth import make_bars, round_trip_closes

CAPITAL = 100_000.0

PARAMS = {
    "signal_kind": "ema",
    "fast_period": 5,
    "slow_period": 20,
    "entry_pct": 100.0,
    "entry_basis": "total",
    "am_size": 40,
}


def build_bars():
    return make_bars(round_trip_closes(240))


def first_cross_index(bars) -> int:
    """测试自带 oracle:原始收盘全序列 EMA5/20 首次金叉下标。"""
    close = np.array([b.close_price for b in bars])
    f = ema_series(close, 5)
    s = ema_series(close, 20)
    for i in range(1, len(close)):
        if cross_direction(f[: i + 1], s[: i + 1]) == 1:
            return i
    raise AssertionError("无金叉")


def _run(bars, cost: CostSettings | None = None):
    return run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, cost or CostSettings(), symbol="TEST")


def test_golden_cross_buys_next_open() -> None:
    bars = build_bars()
    run = _run(bars)
    trades = run.engine.get_all_trades()
    assert trades, "应至少有一笔买入"
    first_buy = trades[0]
    i = first_cross_index(bars)
    # brief 原文 first_buy.time 不存在:TradeData 只有 datetime(findings Task 7)
    assert first_buy.datetime.date() == bars[i + 1].datetime.date()  # t+1 开盘
    assert first_buy.volume == int(CAPITAL / bars[i].close_price)  # 决策收盘价折算,下取整


def test_death_cross_exits_full() -> None:
    bars = build_bars()
    run = _run(bars)
    trades = run.engine.get_all_trades()
    # brief 原文 direction.value == 1/2 不成立:vnpy Direction 枚举值为中文串,直接比枚举
    buys = [t for t in trades if t.direction == Direction.LONG]
    sells = [t for t in trades if t.direction == Direction.SHORT]
    assert buys and sells, "往返形态应有买有卖"
    # 每次卖出都是全仓
    total_buy = sum(t.volume for t in buys)
    total_sell = sum(t.volume for t in sells)
    assert total_buy == total_sell


def test_cash_conservation() -> None:
    bars = build_bars()
    # 引擎 equity 按 net_pnl 扣双边滑点但成交价不含滑点(backtesting.py:722-725/1119),
    # 策略 on_trade 记入同一笔滑点后,默认成本设置下现金账本与引擎台账精确对齐
    run = _run(bars)
    st = run.engine.strategy
    close_last = bars[-1].close_price
    expected_cash = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * close_last
    assert st.cash == pytest.approx(expected_cash, abs=1e-6)


def test_no_trade_during_warmup() -> None:
    bars = build_bars()
    run = _run(bars)
    trades = run.engine.get_all_trades()
    assert trades, "往返形态应有交易,零交易说明策略链路断裂"
    # brief 原文 t.time 不存在,同上改为 datetime
    assert all(t.datetime >= bars[PARAMS["am_size"]].datetime for t in trades)


def test_death_cross_sells_configured_pct() -> None:
    """死叉按 sell_pct 比例卖出,floor 不足 1 股跳过;剩余持仓保留。"""
    bars = make_bars(round_trip_closes())
    params = dict(PARAMS)
    params["sell_pct"] = 50.0
    run = run_backtest(bars, CrossTradeStrategy, params, CAPITAL, CostSettings(), symbol="TEST")
    sells = [t for t in run.engine.get_all_trades() if t.direction == Direction.SHORT]
    buys = [t for t in run.engine.get_all_trades() if t.direction == Direction.LONG]
    assert buys and sells
    assert sells[0].volume == buys[0].volume // 2  # 50% 比例
    # 剩余持仓保留(全平断言不再成立)


def test_death_cross_tiny_pct_skips() -> None:
    """sell_pct 过小 floor→0 股:跳过卖出,持仓保留。"""
    bars = make_bars(round_trip_closes())
    params = dict(PARAMS)
    params["sell_pct"] = 0.05  # ~千股持仓 × 0.05% = <1 股
    run = run_backtest(bars, CrossTradeStrategy, params, CAPITAL, CostSettings(), symbol="TEST")
    sells = [t for t in run.engine.get_all_trades() if t.direction == Direction.SHORT]
    assert not sells, "floor→0 股应跳过卖出"
    assert abs(run.engine.strategy.pos) > 0, "持仓应保留"


def test_death_cross_default_full_exit() -> None:
    """默认 sell_pct=100 行为回退兼容:全仓卖出。"""
    bars = make_bars(round_trip_closes())
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    trades = run.engine.get_all_trades()
    total_buy = sum(t.volume for t in trades if t.direction == Direction.LONG)
    total_sell = sum(t.volume for t in trades if t.direction == Direction.SHORT)
    assert total_buy == total_sell
