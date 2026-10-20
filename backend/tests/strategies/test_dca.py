# tests/strategies/test_dca.py
"""简单定投策略测试:周期锚定(月/周/双周)、金额下取整、现金硬约束、现金守恒。"""
import pytest
from vnpy.trader.constant import Direction

from app.engine.runner import CostSettings, run_backtest
from app.strategies.dca import DcaStrategy
from tests.fixtures.synth import linear_closes, make_bars

CAPITAL = 10_000.0


def test_monthly_buys_first_trading_day() -> None:
    # brief 原文 CAPITAL=10_000 不足:2022-01(暖机)起 14 个周期全额定投需 ≈13.2k,
    # 现金在 2022-11 即耗尽 → 2023 年零买入,跨年月键 (2023,1) 无法验证;
    # 提高到 20_000 保证每个周期恰一笔(含跨年),意图不变(每月首交易日恰一笔)
    bars = make_bars(linear_closes(400, start=100.0, step=0.1), start="2022-01-03")
    run = run_backtest(
        bars,
        DcaStrategy,
        {"interval": "monthly", "amount": 1000.0, "am_size": 10},
        20_000.0,
        CostSettings(),
    )
    trades = run.engine.get_all_trades()
    assert trades, "定投应有买入"
    # brief 原文 direction.value == 1 不成立:vnpy Direction 枚举值为中文串,直接比枚举
    assert all(t.direction == Direction.LONG for t in trades), "定投不卖出"
    # brief 原文 t.time 不存在:TradeData 只有 datetime(findings Task 7);
    # 暖机 am_size=10 → 首个决策 bar=bars[9](inited 于第 10 次 update),t+1 成交在 bars[10]
    assert trades[0].datetime.date() == bars[10].datetime.date()
    months = {(t.datetime.year, t.datetime.month) for t in trades}
    assert len(trades) == len(months), "每月首交易日恰好一笔(月内不重复)"
    # 全覆盖 oracle:暖机月(2022-01)起至末根 bar 月(2023-02)每个 (year, month) 恰一笔
    # → (year, month) 键跨年不碰撞
    assert months == {(2022, m) for m in range(1, 13)} | {(2023, 1), (2023, 2)}


def test_weekly_and_biweekly() -> None:
    # ISO 周锚定:200 根自 2022-01-03(ISO 周 1 的周一)止于 2022-07-22(周 29)。
    # 暖机 10 根落在周 2 周中 → 首笔当周即买(区间起点锚定的诚实语义),故周 2..29 全有买入;
    # 上界 = 周期数(weekly 28 周 / biweekly 14 期),下界为 brief 阈值
    bars = make_bars(linear_closes(200), start="2022-01-03")
    for interval, expect_min, expect_max in (("weekly", 20, 28), ("biweekly", 10, 14)):
        run = run_backtest(
            bars, DcaStrategy, {"interval": interval, "amount": 500.0, "am_size": 10}, CAPITAL, CostSettings()
        )
        trades = run.engine.get_all_trades()
        n = len(trades)
        assert expect_min <= n <= expect_max, f"{interval} 应在 [{expect_min},{expect_max}] 笔,实际 {n}"
        assert all(t.direction == Direction.LONG for t in trades), "定投不卖出"


def test_amount_floor_and_cash_bound() -> None:
    # brief 原文 step=0.05 时决策 bar 收盘 100.45 → floor(1000/100.45)=9 股,且次月还能买 1 股,
    # 与"恰 1 笔 10 股"矛盾 → 改 step=0.0(恒 100.0):10 股花掉 ≈1001.1 后现金 48.9 < 一股价
    bars = make_bars(linear_closes(300, start=100.0, step=0.0), start="2022-01-03")
    run = run_backtest(
        bars, DcaStrategy, {"interval": "monthly", "amount": 1000.0, "am_size": 10}, 1_050.0, CostSettings()
    )
    trades = run.engine.get_all_trades()
    assert len(trades) == 1, "现金只够首期,之后不足一股应全部跳过"
    assert trades[0].direction == Direction.LONG
    assert trades[0].volume == 10, "金额下取整:floor(1000/100)=10 股"
    assert run.engine.strategy.pos == 10
    # 现金 oracle:1050 − 1000(成交额)− 1.0(rate 0.1%)− 0.1(双边滑点 0.01×10)
    assert run.engine.strategy.cash == pytest.approx(48.9, abs=1e-9)


def test_cash_conservation() -> None:
    # default CostSettings():现金账本含费+双边滑点后与引擎台账精确对齐;
    # DCA 现金不断减少、期末仍持仓,恒等式仍须 1e-6 内成立
    bars = make_bars(linear_closes(400, start=100.0, step=0.1), start="2022-01-03")
    run = run_backtest(
        bars, DcaStrategy, {"interval": "monthly", "amount": 1000.0, "am_size": 10}, 20_000.0, CostSettings()
    )
    st = run.engine.strategy
    assert st.pos > 0, "定投期末仍持仓"
    expected = 20_000.0 + run.stats["total_net_pnl"] - abs(st.pos) * bars[-1].close_price
    assert st.cash == pytest.approx(expected, abs=1e-6)
