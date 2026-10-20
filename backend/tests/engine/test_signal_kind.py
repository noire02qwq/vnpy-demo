# tests/engine/test_signal_kind.py
"""C1 回归:signal_kind 注入 + 注册表↔策略 parameters 对齐(F1/F2)。

现状证明(修复前):service.params 装配不含 signal_kind 键,6 个信号形态全部落到
CrossTradeStrategy/CrossTpslStrategy 类默认 signal_kind="ema" → macd/kdj 形态实际按 ema 信号跑。
"""
import pytest

from app.engine.service import _assemble_params
from app.strategies.registry import STRATEGY_REGISTRY

SIGNAL_TYPES = ["macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl"]


@pytest.mark.parametrize("stype", SIGNAL_TYPES)
def test_signal_kind_injected_from_registry(stype: str) -> None:
    meta = STRATEGY_REGISTRY[stype]
    params = _assemble_params(meta, {}, warmup=40)
    assert params["signal_kind"] == meta["signal"]


@pytest.mark.parametrize("stype", SIGNAL_TYPES)
def test_user_params_may_override_signal_kind(stype: str) -> None:
    # signal_kind 放装配字典最前:用户 params 仍可显式覆盖(保持既有顺序语义)
    meta = STRATEGY_REGISTRY[stype]
    params = _assemble_params(meta, {"params": {"signal_kind": "kdj"}}, warmup=40)
    assert params["signal_kind"] == "kdj"


@pytest.mark.parametrize("stype", ["turtle", "dca"])
def test_non_signal_shapes_have_no_signal_kind(stype: str) -> None:
    meta = STRATEGY_REGISTRY[stype]
    assert meta["signal"] is None
    params = _assemble_params(meta, {}, warmup=40)
    assert "signal_kind" not in params


def test_assemble_contract_keys() -> None:
    meta = STRATEGY_REGISTRY["ema_cross"]
    params = _assemble_params(
        meta, {"params": {"fast_period": 3}, "entry_pct": 50.0, "entry_basis": "cash"}, warmup=40
    )
    assert params["fast_period"] == 3  # defaults 被用户 params 覆盖
    assert params["entry_pct"] == 50.0 and params["entry_basis"] == "cash" and params["am_size"] == 40


@pytest.mark.parametrize("stype", list(STRATEGY_REGISTRY))
def test_registry_defaults_are_declared_parameters(stype: str) -> None:
    """堵 C1 类盲区:defaults 注入的键必须被策略类声明才会生效(update_setting 白名单语义)。"""
    meta = STRATEGY_REGISTRY[stype]
    declared = set(meta["cls"].parameters)
    assert set(meta["defaults"]) <= declared
    if meta["signal"] is not None:
        # 信号形态:装配固定注入这 4 键,必须全部声明; turtle/dca 不消费 entry_pct/entry_basis
        # (装配超集键被 update_setting 静默忽略,见 service.py 模块 docstring),不做此断言
        assert {"signal_kind", "entry_pct", "entry_basis", "am_size"} <= declared
