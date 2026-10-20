# app/metrics/benchmark.py
"""基准(^GSPC/SPY)buy&hold 累计收益率曲线,起点 0(坐标原点)。"""
from vnpy.trader.object import BarData


def benchmark_relative_curve(benchmark_bars: list[BarData], capital: float) -> list[float]:
    """同区间买入持有累计收益率(%);capital 保留参数位(当前未用,契约不变)。"""
    if not benchmark_bars:
        return []
    base = benchmark_bars[0].close_price
    return [(b.close_price / base - 1.0) * 100.0 for b in benchmark_bars]
