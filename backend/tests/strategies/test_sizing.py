from app.strategies.sizing import budget_amount, plan_shares


def test_budget_amount() -> None:
    assert budget_amount(100_000.0, 50.0) == 50_000.0
    assert budget_amount(100_000.0, 100.0) == 100_000.0


def test_plan_shares_floor() -> None:
    assert plan_shares(100_000.0, 100.0, 33_334.0, 100_000.0, "total") == 2
    assert plan_shares(100_000.0, 50.0, 10.0, 100_000.0, "total") == 5_000


def test_basis_cash_capped() -> None:
    # base=total equity 10w,但 cash 只有 3w → 受 cash 约束
    assert plan_shares(100_000.0, 100.0, 10.0, 30_000.0, "cash") == 3_000
    # entry_basis=total 允许超出当前现金?不:买入受现金硬约束,超出部分只能到现金能买的最大值
    assert plan_shares(100_000.0, 100.0, 10.0, 30_000.0, "total") == 3_000


def test_zero_when_cannot_afford() -> None:
    assert plan_shares(1_000.0, 100.0, 500.0, 100.0, "cash") == 0


def test_plan_sell_shares_partial_and_floor() -> None:
    from app.strategies.sizing import plan_sell_shares

    assert plan_sell_shares(10, 50.0) == 5
    assert plan_sell_shares(3, 50.0) == 1
    assert plan_sell_shares(3, 20.0) == 0   # floor→0 股,不卖
    assert plan_sell_shares(0, 100.0) == 0  # 无持仓
    assert plan_sell_shares(10, 100.0) == 10
    assert plan_sell_shares(10, 150.0) == 10  # 超 100 按 floor(pos×1.5) 仍受持仓上界
