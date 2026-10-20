import numpy as np

from app.strategies.signals import cross_direction, ema_series, kdj_series, macd_series


def test_cross_direction() -> None:
    assert cross_direction(np.array([1.0, 2.0]), np.array([2.0, 1.0])) == 1  # 金叉
    assert cross_direction(np.array([2.0, 1.0]), np.array([1.0, 2.0])) == -1  # 死叉
    assert cross_direction(np.array([1.0, 1.0]), np.array([2.0, 2.0])) == 0


def test_ema_basic() -> None:
    out = ema_series(np.array([10.0, 10.0, 10.0]), 3)
    assert out[-1] == 10.0


def test_kdj_hand_values() -> None:
    # 9 日高低收固定 → RSV=(C-L9)/(H9-L9)*100
    high = np.full(12, 11.0)
    low = np.full(12, 9.0)
    close = np.full(12, 10.0)
    k, d, j = kdj_series(high, low, close)
    # RSV=50;SMA(X,3,1) 收敛于 50
    assert abs(k[-1] - 50.0) < 1e-6 and abs(d[-1] - 50.0) < 1e-6 and abs(j[-1] - 50.0) < 1e-6


def test_kdj_converges_to_extreme() -> None:
    high = np.full(12, 20.0)
    low = np.full(12, 10.0)
    close = np.full(12, 20.0)  # 收在最高 → RSV=100 → K=D=100, J=100
    k, d, j = kdj_series(high, low, close)
    assert abs(k[-1] - 100.0) < 1e-6 and abs(d[-1] - 100.0) < 1e-6 and abs(j[-1] - 100.0) < 1e-6


def test_macd_series_shape() -> None:
    close = np.linspace(100.0, 120.0, 60)
    dif, dea, hist = macd_series(close, 12, 26, 9)
    assert len(dif) == len(close) and len(dea) == len(close)
    assert np.allclose(hist, 2 * (dif - dea))
