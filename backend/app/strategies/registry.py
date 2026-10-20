"""策略形态注册表:API 层与 meta 端点的唯一映射源。"""
from app.strategies.cross import CrossTradeStrategy
from app.strategies.tpsl import CrossTpslStrategy

_SIGNAL_PARAMS = {
    "macd": {"fast_period": 12, "slow_period": 26, "signal_period": 9},
    "kdj": {"kdj_n": 9, "kdj_m1": 3, "kdj_m2": 3},
    "ema": {"fast_period": 5, "slow_period": 20},
}

# tpsl 形态默认值取测试验证过的配置(entry_basis=cash、am_size=30)
_TPSL_DEFAULTS = {
    "entry_pct": 100.0,
    "entry_basis": "cash",
    "take_profit_pct": 10.0,
    "stop_loss_pct": 5.0,
    "am_size": 30,
}

_CROSS_DEFAULTS = {"entry_pct": 100.0, "entry_basis": "total", "am_size": 100}

_MODE_CLS = {CrossTradeStrategy: "cross", CrossTpslStrategy: "tpsl"}

STRATEGY_REGISTRY: dict[str, dict] = {
    f"{sig}_{_MODE_CLS[cls]}": {
        "cls": cls,
        "kind": "signal",
        "signal": sig,
        "mode": _MODE_CLS[cls],
        "defaults": {
            **_SIGNAL_PARAMS[sig],
            **(_TPSL_DEFAULTS if cls is CrossTpslStrategy else _CROSS_DEFAULTS),
        },
    }
    for sig in ("macd", "kdj", "ema")
    for cls in (CrossTradeStrategy, CrossTpslStrategy)
}
