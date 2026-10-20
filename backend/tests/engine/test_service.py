# tests/engine/test_service.py
"""回测编排装配测试:mock 数据层,断言结果契约形状。"""
from datetime import datetime

import pytest

from app.engine.service import _align_benchmark, build_candles, execute_backtest
from tests.fixtures.synth import linear_closes, make_bar, make_bars


def fake_benchmark_fetcher(symbol, start, end):
    return make_bars(linear_closes(240), start="2023-01-02")


REQ = {
    "symbol": "TEST", "start": "2023-01-02", "end": "2024-12-31", "initial_capital": 100000.0,
    "strategy": {"type": "ema_cross", "params": {"fast_period": 5, "slow_period": 20},
                 "entry_pct": 100.0, "entry_basis": "total"},
    "benchmark_symbol": "^GSPC", "cost": {}, "warmup_bars": 40,
}


def test_execute_backtest_shape() -> None:
    import app.engine.service as svc
    from tests.fixtures.synth import v_shape_closes

    orig = svc._load_symbol_bars
    svc._load_symbol_bars = lambda symbol, start, end, warmup: make_bars(v_shape_closes(240), start=start)
    try:
        out = execute_backtest(dict(REQ), benchmark_fetcher=fake_benchmark_fetcher)
    finally:
        svc._load_symbol_bars = orig
    assert set(out.metrics) >= {"total_return", "annual_return", "alpha_annual", "beta", "max_drawdown",
                                "annual_volatility", "sharpe_ratio", "information_ratio"}
    assert out.curves["benchmark"][0] == 0.0 and len(out.curves["equity"]) == len(out.curves["dates"])
    assert out.candles["dates"] == out.curves["dates"]
    assert {"ema_fast", "ema_slow"} <= set(out.candles["overlays"])
    assert out.stats_raw["total_trade_count"] >= 0
    assert 0 <= out.metrics["max_drawdown"] <= 1  # 风控层小数口径 MDD(spec §7)
    assert "max_drawdown_amount" in out.metrics  # vnpy 美元口径 MDD(有交易时为负美元额)
    assert all(isinstance(t["price"], float) and t["direction"] in ("buy", "sell") for t in out.trades)


def test_build_candles_macd_sub() -> None:
    bars = make_bars(linear_closes(120))
    out = build_candles(bars, "macd", {"fast_period": 12, "slow_period": 26, "signal_period": 9})
    assert set(out["sub"]) == {"macd"}
    assert set(out["sub"]["macd"]) == {"dif", "dea", "hist"}
    assert len(out["sub"]["macd"]["dif"]) == len(out["dates"]) == 120
    assert out["overlays"] == {}


def test_build_candles_none_signal_empty_overlays() -> None:
    from app.strategies.registry import STRATEGY_REGISTRY

    meta = STRATEGY_REGISTRY["turtle"]
    assert meta["signal"] is None
    bars = make_bars(linear_closes(120))
    out = build_candles(bars, meta["signal"], dict(meta["defaults"]))
    assert out["overlays"] == {} and out["sub"] == {}
    assert len(out["dates"]) == 120 and len(out["close"]) == 120


def test_align_benchmark_ffill_and_leading_fill() -> None:
    """I3:基准 close 按主曲线日期对齐——缺失日前值填充,开头缺失用首个可用值,首值 0.0。

    基准 bar 只有 01-03(100)/01-05(110)/01-06(90):01-04 为内部缺口,01-01/02 开头缺失,
    01-07 尾部缺失。make_bars 只产连续日,故用 make_bar 手工跳日构造。
    """
    bench = [
        make_bar(datetime(2023, 1, 3), 100, 101.0, 99.0, 100.0),
        make_bar(datetime(2023, 1, 5), 110, 111.1, 108.9, 110.0),
        make_bar(datetime(2023, 1, 6), 90, 90.9, 89.1, 90.0),
    ]
    dates = ["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05", "2023-01-06", "2023-01-07"]
    out = _align_benchmark(bench, dates)
    assert len(out) == len(dates)
    assert out[0] == 0.0  # 首日相对基准首日(首个可用值 100)
    assert out[1] == 0.0  # 开头缺失回填首值
    assert out[2] == 0.0  # 01-03 有值 100
    assert out[3] == 0.0  # 01-04 内部缺失 → ffill 100
    assert out[4] == pytest.approx(10.0)  # 110/100-1
    assert out[5] == pytest.approx(-10.0)  # 90/100-1
    assert out[6] == pytest.approx(-10.0)  # 尾日缺失 → ffill 90


def test_align_benchmark_empty_bars() -> None:
    assert _align_benchmark([], ["2023-01-02"]) == []


def test_benchmark_aligned_to_curve_dates() -> None:
    """基准与主数据有日期缺口时,benchmark 曲线仍与 dates 等长(修复前为短序列错位)。"""
    import app.engine.service as svc
    from tests.fixtures.synth import v_shape_closes

    def gapped_benchmark(symbol, start, end):
        # 主数据自 2023-01-02 起,基准缺前 3 天(自然日)→ 日期缺口
        return make_bars(linear_closes(237), start="2023-01-05")

    orig = svc._load_symbol_bars
    svc._load_symbol_bars = lambda symbol, start, end, warmup: make_bars(v_shape_closes(240), start=start)
    try:
        out = execute_backtest(dict(REQ), benchmark_fetcher=gapped_benchmark)
    finally:
        svc._load_symbol_bars = orig
    assert len(out.curves["dates"]) == 240
    assert len(out.curves["benchmark"]) == len(out.curves["dates"])
    assert out.curves["benchmark"][0] == 0.0
