# tests/fixtures/synth.py
"""确定性合成 K 线生成器:供策略/引擎/曲线测试构造已知形态。"""
from datetime import datetime, timedelta

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.object import BarData


def make_bar(dt: datetime, o: float, h: float, l: float, c: float, v: float = 1000.0) -> BarData:
    return BarData(
        symbol="TEST",
        exchange=Exchange.SMART,
        datetime=dt,
        gateway_name="test",
        open_price=o,
        high_price=h,
        low_price=l,
        close_price=c,
        volume=v,
        interval=Interval.DAILY,
    )


def make_bars(closes: list[float], start: str = "2023-01-02", volumes: list[float] | None = None) -> list[BarData]:
    bars: list[BarData] = []
    day = datetime.strptime(start, "%Y-%m-%d")
    prev = closes[0]
    for i, c in enumerate(closes):
        o = prev
        bars.append(make_bar(day, o, round(max(o, c) * 1.01, 2), round(min(o, c) * 0.99, 2), c, (volumes or [1000.0] * len(closes))[i]))
        prev = c
        day += timedelta(days=1)
    return bars


def linear_closes(n: int, start: float = 100.0, step: float = 1.0) -> list[float]:
    return [round(start + step * i, 4) for i in range(n)]


def sine_closes(n: int, base: float = 100.0, amp: float = 10.0, period: int = 40) -> list[float]:
    import math

    return [round(base + amp * math.sin(2 * math.pi * i / period), 4) for i in range(n)]


def v_shape_closes(n: int = 240, trough: float = 0.5) -> list[float]:
    half = n // 2
    down = [round(100.0 * (1 - (1 - trough) * i / half), 4) for i in range(half)]
    up = [round(100.0 * trough * (1 + 0.9 * i / half), 4) for i in range(half)]
    return down + up
