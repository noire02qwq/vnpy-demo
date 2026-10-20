"""策略形态注册表:API 层与 meta 端点的唯一映射源。"""
from app.strategies.cross import CrossTradeStrategy

_SIGNAL_PARAMS = {
    "macd": {"fast_period": 12, "slow_period": 26, "signal_period": 9},
    "kdj": {"kdj_n": 9, "kdj_m1": 3, "kdj_m2": 3},
    "ema": {"fast_period": 5, "slow_period": 20},
}

STRATEGY_REGISTRY: dict[str, dict] = {
    f"{sig}_{mode}": {
        "cls": CrossTradeStrategy,
        "kind": "signal",
        "signal": sig,
        "mode": mode,
        "defaults": {**_SIGNAL_PARAMS[sig], "entry_pct": 100.0, "entry_basis": "total", "am_size": 100},
    }
    for sig in ("macd", "kdj", "ema")
    for mode in ("cross",)
}
