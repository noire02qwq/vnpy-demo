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


def round_trip_closes(n: int = 240) -> list[float]:
    """跌→涨→跌往返形态:涨段出金叉建仓,跌段出死叉清仓,期末空仓。

    V 形(先跌后涨)只有一次金叉、涨段单调无死叉,验证不了全仓退出;
    本形态补上尾段下跌,使金叉→死叉完整走一遍。
    """
    down1 = linear_closes(70, 100.0, -0.6)  # 100 → 58.6
    up = linear_closes(90, 58.0, 0.9)  # 58 → 137.2(金叉在 78)
    down2 = linear_closes(80, 136.4, -0.7)  # 136.4 → 80.6(死叉在 169)
    return (down1 + up + down2)[:n]
