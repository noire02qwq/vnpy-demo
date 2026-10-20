# tests/engine/test_service.py
"""回测编排装配测试:mock 数据层,断言结果契约形状。"""
from app.engine.service import build_candles, execute_backtest
from tests.fixtures.synth import linear_closes, make_bars


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
