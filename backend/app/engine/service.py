# app/engine/service.py
"""回测编排:数据→策略→引擎→曲线→指标→candles 装配(Task 17/18 复用本模块产物)。

参数装配契约(已验证 vnpy_ctastrategy 1.4.1 template.py:44-50):``CtaTemplate.update_setting``
只遍历策略类声明的 ``parameters`` 列表并对其中存在的键 setattr,设置字典中的多余键被
静默忽略、不抛异常 → 装配时无需按 registry defaults 键集过滤 ``strategy.params``,
turtle/dca 形态收到 entry_pct 等无关键亦安全。

风控校验决策:仅校验 strategy.type 存在于注册表(未知形态 → BAD_PARAMS);
tp/sl 缺省由 registry defaults 补齐(tpsl 形态默认 10/5),缺 key 不视为非法。
"""
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import numpy as np
from vnpy.trader.object import BarData

from app.core.config import Settings, get_settings
from app.core.errors import AppError, ErrorCode
from app.data.validate import check_symbol
from app.engine.curves import build_curves
from app.engine.runner import CostSettings, run_backtest
from app.metrics.risk import compute_risk_metrics
from app.strategies.registry import STRATEGY_REGISTRY
from app.strategies.signals import signal_series


@dataclass
class BacktestResultData:
    """execute_backtest 产物;Task 17 经 repo.save_run 持久化,Task 18 经 API 暴露。"""

    request: dict[str, Any]
    metrics: dict[str, Any]
    curves: dict[str, Any]
    candles: dict[str, Any]
    trades: list[dict[str, Any]]
    stats_raw: dict[str, Any] = field(default_factory=dict)


def _to_jsonable(v: Any) -> Any:
    """vnpy stats 标量 → JSON 安全类型:date→str、np.integer→int、np.floating→float。"""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    return v


def _load_symbol_bars(symbol: str, start: str, end: str, warmup: int) -> list[BarData]:
    """生产实现:fetch_daily→cache→to_bar_data(网络层注入点,测试覆盖之)。"""
    from app.data.bars import to_bar_data
    from app.data.cache import ParquetCache
    from app.data.yahoo import fetch_daily

    s: Settings = get_settings()
    cache = ParquetCache(s.data_dir / "cache", s.cache_ttl_days)
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    df = cache.get(symbol, d0, d1, date.today())
    if df is None:
        df = fetch_daily(symbol, d0, d1, warmup_bars=warmup)
        cache.put(df, symbol, d0, d1, date.today())
    return to_bar_data(df, symbol)


def _assemble_params(meta: dict, strategy_cfg: dict, warmup: int) -> dict[str, Any]:
    """params 装配(模块级纯函数):signal_kind 置首(可被用户 params 覆盖,保持该顺序语义)
    ← 注册表 defaults ← 用户 params ← 契约键 entry_pct/entry_basis/am_size(warmup 胜出)。

    相对策略 parameters 的多余键(turtle/dca 收到 entry_pct 等)被 ``CtaTemplate.update_setting``
    静默忽略(1.4.1 template.py:44-50),故不做键集过滤 —— 见模块 docstring。
    """
    params: dict[str, Any] = {}
    if meta["signal"] is not None:
        params["signal_kind"] = meta["signal"]
    params.update(meta["defaults"])
    params.update(strategy_cfg.get("params") or {})
    params["entry_pct"] = float(strategy_cfg.get("entry_pct") or 100.0)
    params["entry_basis"] = strategy_cfg.get("entry_basis") or "total"
    params["am_size"] = warmup
    return params


def _aligned_close_series(bench_bars: list[BarData], dates: list[str]) -> list[float]:
    """基准 close 按主曲线日期轴对齐:缺失日取前值(ffill),开头缺失回填首个可用值。

    返回与 dates 等长的 close 序列(供风控层日收益计算);基准为空 → []。
    """
    if not bench_bars:
        return []
    close_by_date = {b.datetime.strftime("%Y-%m-%d"): float(b.close_price) for b in bench_bars}
    filled: list[float | None] = []
    last: float | None = None
    for d in dates:
        if d in close_by_date:
            last = close_by_date[d]
        filled.append(last)
    first = next((v for v in filled if v is not None), None)
    if first is None:
        return []
    return [v if v is not None else first for v in filled]


def _align_benchmark(bench_bars: list[BarData], dates: list[str]) -> list[float]:
    """基准累计收益率 %(与 dates 等长):首日相对基准首日 → 首值恒 0.0(坐标原点语义不变)。"""
    closes = _aligned_close_series(bench_bars, dates)
    if not closes:
        return []
    base = closes[0]
    return [(c / base - 1.0) * 100.0 for c in closes]


def build_candles(bars: list[BarData], signal: str | None, params: dict[str, Any]) -> dict[str, Any]:
    """K 线 + 信号叠加:ema→overlays 双线,macd/kdj→sub 副图,turtle/dca 两者皆空。"""
    out: dict[str, Any] = {
        "dates": [b.datetime.strftime("%Y-%m-%d") for b in bars],
        "open": [float(b.open_price) for b in bars],
        "high": [float(b.high_price) for b in bars],
        "low": [float(b.low_price) for b in bars],
        "close": [float(b.close_price) for b in bars],
        "volume": [float(b.volume) for b in bars],
        "overlays": {},
        "sub": {},
    }
    if signal:
        series = signal_series(signal, bars, params)
        if signal == "ema":
            out["overlays"] = {"ema_fast": series["ema_fast"], "ema_slow": series["ema_slow"]}
        else:
            out["sub"] = {signal: series}
    return out


def execute_backtest(request: dict[str, Any], *, benchmark_fetcher: Callable | None = None) -> BacktestResultData:
    check_symbol(request["symbol"])
    meta = STRATEGY_REGISTRY.get(request["strategy"]["type"])
    if meta is None:
        raise AppError(ErrorCode.BAD_PARAMS, f"未知策略形态: {request['strategy']['type']}")
    warmup = int(request.get("warmup_bars") or get_settings().default_warmup_bars)
    bars = _load_symbol_bars(request["symbol"], request["start"], request["end"], warmup)
    capital = float(request["initial_capital"])
    cost_cfg = request.get("cost") or {}
    cost = CostSettings(
        rate=float(cost_cfg.get("commission_rate", get_settings().default_commission_rate)),
        slippage=float(cost_cfg.get("slippage", get_settings().default_slippage)),
        # spec §8 移除 commission_fixed(CostConfig extra="forbid" 拒未知键);1.4.1 引擎无 fixed,rate-only
        fixed=0.0,
    )
    params = _assemble_params(meta, request["strategy"], warmup)
    run = run_backtest(bars, meta["cls"], params, capital, cost, symbol=request["symbol"])
    curves = build_curves(run, bars, capital)

    fetch = benchmark_fetcher or (lambda sym, a, b: _load_symbol_bars(sym, a, b, warmup))
    bench_bars = fetch(request.get("benchmark_symbol") or get_settings().default_benchmark,
                       request["start"], request["end"])
    # 基准按主曲线日期轴对齐后再喂风控层(等长序列,beta/alpha/IR 才同源)
    aligned_bench_close = _aligned_close_series(bench_bars, curves.dates)
    s: Settings = get_settings()
    risk = compute_risk_metrics(curves.equity, aligned_bench_close,
                                annual_days=s.annualization_days, risk_free_rate=s.risk_free_rate)
    curves_out = {
        "dates": curves.dates,
        "equity": curves.equity,
        "position_value": curves.position_value,
        "benchmark": _align_benchmark(bench_bars, curves.dates),
    }
    candles = build_candles(bars, meta["signal"], params)

    from vnpy.trader.constant import Direction

    trades = [
        {
            "time": t.datetime.strftime("%Y-%m-%d"),
            "direction": "buy" if t.direction == Direction.LONG else "sell",
            "price": float(t.price),
            "volume": float(t.volume),
        }
        for t in run.engine.get_all_trades()
    ]
    stat_keys = ("start_date", "end_date", "total_days", "total_trade_count", "total_commission",
                 "total_turnover", "max_drawdown", "return_drawdown_ratio")
    # vnpy 美元口径 MDD 改名 max_drawdown_amount,保留风控层小数口径 max_drawdown(spec §7,前端直接消费)
    stats_out = {("max_drawdown_amount" if k == "max_drawdown" else k): _to_jsonable(run.stats[k])
                 for k in stat_keys if k in run.stats}
    metrics = {**risk, **stats_out}
    return BacktestResultData(
        request=request,
        metrics=metrics,
        curves=curves_out,
        candles=candles,
        trades=trades,
        stats_raw=dict(run.stats),
    )
