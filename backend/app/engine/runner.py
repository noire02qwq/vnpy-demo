"""vnpy BacktestingEngine 无 GUI 程序化驱动(见 docs/research/vnpy-code-findings.md)。"""
import inspect
from dataclasses import dataclass, field
from typing import Any

from vnpy.trader.constant import Interval
from vnpy.trader.object import BarData
from vnpy_ctastrategy.backtesting import BacktestingEngine


@dataclass
class CostSettings:
    rate: float = 0.001
    slippage: float = 0.01
    fixed: float = 0.0
    pricetick: float = 0.01
    size: int = 1


@dataclass
class BacktestRun:
    engine: BacktestingEngine
    stats: dict[str, Any] = field(default_factory=dict)


def run_backtest(
    bars: list[BarData],
    strategy_class: type,
    strategy_params: dict[str, Any],
    capital: float,
    cost: CostSettings,
    symbol: str = "TEST",
) -> BacktestRun:
    if not bars:
        raise ValueError("bars 为空")
    engine = BacktestingEngine()
    kwargs: dict[str, Any] = {
        "vt_symbol": f"{symbol}.SMART",
        "interval": Interval.DAILY,
        "start": bars[0].datetime,
        "end": bars[-1].datetime,
        "rate": cost.rate,
        "slippage": cost.slippage,
        "size": cost.size,
        "pricetick": cost.pricetick,
        "capital": capital,
    }
    if "fixed" in inspect.signature(engine.set_parameters).parameters:
        kwargs["fixed"] = cost.fixed  # 1.4.1 无 fixed,守卫后降级为 rate-only
    engine.set_parameters(**kwargs)
    engine.add_strategy(strategy_class, dict(strategy_params))
    engine.history_data = list(bars)  # 绕过数据库直注(尽调结论),run_backtesting 不再调 load_data
    engine.run_backtesting()
    engine.calculate_result()
    stats = engine.calculate_statistics(output=False)
    return BacktestRun(engine=engine, stats=stats)
