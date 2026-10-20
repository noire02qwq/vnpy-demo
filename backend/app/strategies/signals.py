"""信号源:纯 numpy 计算(与 vnpy ArrayManager 数组同序),便于独立测试与前端副图复用。"""

from typing import Any

import numpy as np
from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager


def _sma_cn(x: np.ndarray, n: int, m: int) -> np.ndarray:
    """国内 SMA(X,N,M): Y=(M*X+(N-M)*Y')/N,首值取 X。"""
    y = np.empty_like(x, dtype=float)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = (m * x[i] + (n - m) * y[i - 1]) / n
    return y


def ema_series(close: np.ndarray, period: int) -> np.ndarray:
    out = np.empty_like(close, dtype=float)
    out[0] = close[0]
    k = 2.0 / (period + 1.0)
    for i in range(1, len(close)):
        out[i] = close[i] * k + out[i - 1] * (1 - k)
    return out


def macd_series(
    close: np.ndarray, fast: int, slow: int, signal: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    dif = ema_series(close, fast) - ema_series(close, slow)
    dea = ema_series(dif, signal)
    return dif, dea, 2.0 * (dif - dea)


def kdj_series(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    n: int = 9,
    m1: int = 3,
    m2: int = 3,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    hn = np.full_like(close, np.nan, dtype=float)
    ln = np.full_like(close, np.nan, dtype=float)
    for i in range(len(close)):
        lo = max(0, i - n + 1)
        hn[i] = high[lo : i + 1].max()
        ln[i] = low[lo : i + 1].min()
    denom = np.where(hn - ln == 0, 1e-9, hn - ln)
    rsv = (close - ln) / denom * 100.0
    k = _sma_cn(rsv, m1, 1)
    d = _sma_cn(k, m2, 1)
    return k, d, 3.0 * k - 2.0 * d


def cross_direction(f: np.ndarray, s: np.ndarray) -> int:
    if len(f) < 2:
        return 0
    f0, f1, s0, s1 = f[-2], f[-1], s[-2], s[-1]
    if f0 <= s0 and f1 > s1:
        return 1
    if f0 >= s0 and f1 < s1:
        return -1
    return 0


def signal_direction(kind: str, am: ArrayManager, params: dict[str, Any]) -> int:
    if kind == "macd":
        dif, dea, _ = macd_series(
            am.close, params["fast_period"], params["slow_period"], params["signal_period"]
        )
        return cross_direction(dif, dea)
    if kind == "kdj":
        k, d, _ = kdj_series(
            am.high, am.low, am.close, params["kdj_n"], params["kdj_m1"], params["kdj_m2"]
        )
        return cross_direction(k, d)
    if kind == "ema":
        return cross_direction(
            ema_series(am.close, params["fast_period"]), ema_series(am.close, params["slow_period"])
        )
    raise ValueError(f"未知信号: {kind}")


def signal_series(kind: str, bars: list[BarData], params: dict[str, Any]) -> dict[str, list[float]]:
    close = np.array([b.close_price for b in bars])
    high = np.array([b.high_price for b in bars])
    low = np.array([b.low_price for b in bars])
    if kind == "macd":
        dif, dea, hist = macd_series(
            close, params["fast_period"], params["slow_period"], params["signal_period"]
        )
        return {"dif": dif.tolist(), "dea": dea.tolist(), "hist": hist.tolist()}
    if kind == "kdj":
        k, d, j = kdj_series(high, low, close, params["kdj_n"], params["kdj_m1"], params["kdj_m2"])
        return {"k": k.tolist(), "d": d.tolist(), "j": j.tolist()}
    if kind == "ema":
        return {
            "ema_fast": ema_series(close, params["fast_period"]).tolist(),
            "ema_slow": ema_series(close, params["slow_period"]).tolist(),
        }
    return {}
