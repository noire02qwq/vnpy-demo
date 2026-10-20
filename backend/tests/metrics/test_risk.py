# tests/metrics/test_risk.py
"""风险指标测试:平坦增长 / 手算回撤 / 完全同步 tracker / 基准曲线 / n<3 护栏。"""
import pytest

from app.metrics.risk import compute_risk_metrics
from tests.fixtures.synth import linear_closes, make_bars


def flat(n: float, days: int) -> list[float]:
    return [n] * days


def test_no_risk_flat_growth() -> None:
    eq = [100.0 * (1 + 0.001) ** i for i in range(251)]
    bench = flat(100.0, 251)
    m = compute_risk_metrics(eq, bench)
    assert m["total_return"] == pytest.approx((eq[-1] / eq[0]) - 1, rel=1e-9)
    assert m["annual_volatility"] == pytest.approx(0.0, abs=1e-9)
    assert m["max_drawdown"] == pytest.approx(0.0, abs=1e-9)
    assert m["sharpe_ratio"] is None or m["sharpe_ratio"] > 0  # std=0 → None


def test_hand_computed_drawdown() -> None:
    eq = [100.0, 120.0, 60.0, 90.0]
    m = compute_risk_metrics(eq, [100.0] * 4)
    # 峰值 120 → 谷值 60:MDD = 1 - min(equity/cummax) = 1 - 60/120 = 0.5
    assert m["max_drawdown"] == pytest.approx(1 - 60.0 / 120.0)


def test_beta_of_perfect_tracker() -> None:
    bench = [100 * (1 + 0.01) ** i for i in range(120)]
    eq = list(bench)  # 完全同步
    m = compute_risk_metrics(eq, bench)
    # cov(rp, rb)/var(rb),rp≡rb → cov=var → beta=1
    assert m["beta"] == pytest.approx(1.0, rel=1e-6)
    # 契约修正:完全同步 → 超额 rp-rb 恒为 0,std(ddof=1)=0,IR 按 spec §7 规定为 None
    # (0/0 无定义),而非 brief 手写的 0.0。
    assert m["information_ratio"] is None


def test_benchmark_curve() -> None:
    from app.metrics.benchmark import benchmark_relative_curve

    bars = make_bars(linear_closes(50))
    curve = benchmark_relative_curve(bars, 1000.0)
    assert curve[0] == 0.0
    assert curve[-1] == pytest.approx(
        (bars[-1].close_price / bars[0].close_price - 1) * 100, rel=1e-6
    )


def test_too_short_returns_all_none() -> None:
    # n<3 护栏:eq/bench 按索引前对齐后不足 3 点 → 8 项指标全 None
    m = compute_risk_metrics([100.0, 101.0], [100.0, 99.0])
    assert m == {
        "total_return": None,
        "annual_return": None,
        "beta": None,
        "alpha_annual": None,
        "max_drawdown": None,
        "annual_volatility": None,
        "sharpe_ratio": None,
        "information_ratio": None,
    }
