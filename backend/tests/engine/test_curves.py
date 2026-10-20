# tests/engine/test_curves.py
"""曲线导出测试:equity/position_value/cash 三曲线与引擎台账逐日自洽。"""
import pytest

from app.engine.curves import build_curves
from app.engine.runner import CostSettings, run_backtest
from app.strategies.cross import CrossTradeStrategy
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


def test_curves_consistency() -> None:
    bars = make_bars(round_trip_closes(240))
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    curves = build_curves(run, bars, CAPITAL)
    n = len(curves.dates)
    assert n == len(bars) and n == len(curves.equity) == len(curves.position_value) == len(curves.cash)
    assert curves.dates[0] == bars[0].datetime.strftime("%Y-%m-%d")
    assert curves.equity[0] == pytest.approx(CAPITAL, abs=0.02)  # 首日≈初始资金
    for eq, pv, c in zip(curves.equity, curves.position_value, curves.cash):
        assert c == pytest.approx(eq - pv, abs=1e-6)
    # 空仓日持仓资金为 0;往返形态必有持仓日与空仓日并存
    assert all(pv >= 0 for pv in curves.position_value)
    assert any(pv > 0 for pv in curves.position_value)
    assert any(pv == 0 for pv in curves.position_value)
    # 期末现金与策略台账精确对齐(Task 13 已证恒等式的最强 oracle)
    assert curves.cash[-1] == pytest.approx(run.engine.strategy.cash, abs=1e-6)
