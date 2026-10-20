# app/metrics/risk.py
"""风险调整指标(对齐 docs/回测指标.tmp)。beta/alpha 用 CAPM;IR 用超额收益。"""
import math
from typing import Any

import numpy as np

_NONE_KEYS = (
    "total_return", "annual_return", "beta", "alpha_annual",
    "max_drawdown", "annual_volatility", "sharpe_ratio", "information_ratio",
)


def _daily_returns(xs: list[float]) -> np.ndarray:
    arr = np.asarray(xs, dtype=float)
    if len(arr) < 2:
        return np.array([])
    return arr[1:] / arr[:-1] - 1.0


def compute_risk_metrics(
    equity: list[float],
    benchmark_close: list[float],
    *,
    annual_days: int = 250,
    risk_free_rate: float = 0.0,
) -> dict[str, Any]:
    n = min(len(equity), len(benchmark_close))  # 按索引前对齐,取短者
    if n < 3:
        return {k: None for k in _NONE_KEYS}
    eq = np.asarray(equity[:n], dtype=float)
    bench = np.asarray(benchmark_close[:n], dtype=float)
    total = eq[-1] / eq[0] - 1.0
    annual = (eq[-1] / eq[0]) ** (annual_days / n) - 1.0
    rp, rb = _daily_returns(eq), _daily_returns(bench)
    rf_d = risk_free_rate / annual_days
    mdd_arr = eq / np.maximum.accumulate(eq) - 1.0
    mdd = float(-mdd_arr.min())
    vol = float(rp.std(ddof=1)) * math.sqrt(annual_days)
    cov = float(np.cov(rp, rb, ddof=1)[0][1])
    var = float(rb.var(ddof=1))
    beta = cov / var if var > 0 else None
    bench_annual = (bench[-1] / bench[0]) ** (annual_days / n) - 1.0
    alpha = None
    if beta is not None:
        alpha = float((annual - risk_free_rate) - beta * (bench_annual - risk_free_rate))
    rp_std = float(rp.std(ddof=1))
    sharpe = (float(rp.mean()) - rf_d) / rp_std * math.sqrt(annual_days) if rp_std > 0 else None
    excess = rp - rb
    ex_std = float(excess.std(ddof=1))
    ir = float(excess.mean()) / ex_std * math.sqrt(annual_days) if ex_std > 0 else None
    return {
        "total_return": float(total),
        "annual_return": float(annual),
        "beta": beta,
        "alpha_annual": alpha,
        "max_drawdown": mdd,
        "annual_volatility": vol,
        "sharpe_ratio": sharpe,
        "information_ratio": ir,
    }
