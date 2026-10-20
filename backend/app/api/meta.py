# app/api/meta.py
"""策略形态目录:注册表 → 前端动态表单所需的简易参数 JSON Schema。"""
from typing import Any

from fastapi import APIRouter

from app.strategies.registry import STRATEGY_REGISTRY

router = APIRouter(prefix="/api/v1")

# 字符串参数的封闭枚举集(interval 与 DcaStrategy.period_key 分支一致;
# entry_basis 与 StrategySpec.entry_basis Literal 同源)
ENUM_MAP: dict[str, list[str]] = {
    "interval": ["weekly", "biweekly", "monthly"],
    "entry_basis": ["total", "cash"],
}


def _param_schema(key: str, value: Any) -> dict[str, Any]:
    """defaults 标量 → JSON Schema 片段(bool 需先于 int 判定,bool 是 int 子类;
    int 给 minimum:1 兜底周期/天数类参数,非负语义由策略层自证)。"""
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, str):
        schema: dict[str, Any] = {"type": "string"}
        if key in ENUM_MAP:
            schema["enum"] = list(ENUM_MAP[key])
        return schema
    if isinstance(value, int):
        return {"type": "integer", "minimum": 1}
    return {"type": "number"}


@router.get("/meta/strategies")
def list_strategies() -> dict:
    strategies = [
        {
            "type": key,
            "kind": meta["kind"],
            "signal": meta["signal"],
            "mode": meta["mode"],
            "defaults": dict(meta["defaults"]),
            "schema": {k: _param_schema(k, v) for k, v in meta["defaults"].items()},
        }
        for key, meta in STRATEGY_REGISTRY.items()
    ]
    return {"strategies": strategies}
