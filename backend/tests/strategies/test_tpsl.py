# tests/strategies/test_tpsl.py
"""金叉买入+固定止盈止损行为测试:止损 stop 单、跳空止盈限价单、死叉兜底、现金守恒。"""
import pytest
from vnpy.trader.constant import Direction

from app.engine.runner import CostSettings, run_backtest
from app.strategies.tpsl import CrossTpslStrategy
from tests.fixtures.synth import make_bars

CAPITAL = 100_000.0

PARAMS = {
    "signal_kind": "ema",
    "fast_period": 3,
    "slow_period": 10,
    "entry_pct": 100.0,
    "entry_basis": "cash",
    "take_profit_pct": 20.0,
    "stop_loss_pct": 5.0,
    "am_size": 30,
}

_RISE = [100.0] * 40 + [100 + i for i in range(1, 11)]


def bars_stop_loss_hit():
    # 40 震荡(暖机)→ 10 根上涨(金叉买入@101)→ 20 根急跌(-8/根):
    # -2/根温和阴跌时 EMA3/10 死叉在 close=104 先于止损发生(实测),改 -8/根
    # 使 low 在死叉前触及 SL=95.95,确保走的是止损 stop 单路径而非死叉兜底
    return make_bars(_RISE + [110 - 8 * (i + 1) for i in range(20)])


def bars_gap_up_tp():
    # 40 震荡 → 10 根上涨(买入@101)→ 跳空高开 25% 至 138(触发止盈 20%)
    return make_bars(_RISE + [138.0] * 15)


def _run(bars):
    return run_backtest(bars, CrossTpslStrategy, dict(PARAMS), CAPITAL, CostSettings())


def _sells(trades):
    return [t for t in trades if t.direction == Direction.SHORT]


def _buy(trades):
    return next(t for t in trades if t.direction == Direction.LONG)


def test_stop_loss_exit() -> None:
    run = _run(bars_stop_loss_hit())
    trades = run.engine.get_all_trades()
    sells = _sells(trades)
    assert sells, "下跌应触发止损卖出"
    buy = _buy(trades)
    # 引擎 stop 单语义(backtesting.py:766-798):bar.low <= stop_price 触发,
    # 成交价 = min(stop_price, bar.open);成交价不含滑点(:798),滑点仅在净值侧扣(:1119)。
    # SL=round(101*0.95,2)=95.95,触发 bar open=102 → 精确成交 95.95
    assert sells[0].price == pytest.approx(buy.price * 0.95, abs=0.01)


def test_take_profit_on_gap() -> None:
    run = _run(bars_gap_up_tp())
    trades = run.engine.get_all_trades()
    sells = _sells(trades)
    assert sells, "跳空高开应触发止盈卖出"
    buy = _buy(trades)
    # 引擎限价卖单语义(backtesting.py:699-723):bar.high >= 委托价才成交,
    # 成交价 = max(委托价, bar.open)。跳空 bar open=110 < TP=round(101*1.2,2)=121.2
    # → 成交价恰为 TP=buy*1.20,不追高以开盘价成交
    assert sells[0].price == pytest.approx(buy.price * 1.20, abs=0.01)
    # 止盈成交(pos→0)后 on_trade 的 cancel_all 必须清掉残留 SL stop 单,
    # 否则后续 bar low 一旦低于 SL 会以零持仓误触发
    assert not run.engine.active_stop_orders, "止盈后不得残留止损 stop 单"


def test_death_cross_fallback_exit() -> None:
    # brief 原数据(110 横盘)EMA3 恒高于 EMA10 永不死叉、零卖出(实测);
    # 改为温和回落至 105 横盘:high<121.2 不触 TP、low>95.95 不触 SL,仅死叉兜底清仓
    bars = make_bars(_RISE + [105.0] * 15)
    run = _run(bars)
    assert _sells(run.engine.get_all_trades()), "死叉应兜底清仓"


def test_cash_conservation() -> None:
    bars = bars_stop_loss_hit()
    run = _run(bars)
    st = run.engine.strategy
    expected = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * bars[-1].close_price
    assert st.cash == pytest.approx(expected, abs=1e-6)
