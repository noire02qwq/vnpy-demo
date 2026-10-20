# app/api/meta.py
"""策略形态目录:注册表 → 前端动态表单所需的简易参数 JSON Schema。"""
from typing import Any

from fastapi import APIRouter

from app.strategies.registry import STRATEGY_REGISTRY

router = APIRouter(prefix="/api/v1")


def _param_type(value: Any) -> str:
    """defaults 标量 → JSON Schema 类型名(bool 需先于 int 判定,bool 是 int 子类)。"""
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "string"
    return "number"


@router.get("/meta/strategies")
def list_strategies() -> dict:
    strategies = [
        {
            "type": key,
            "kind": meta["kind"],
            "signal": meta["signal"],
            "mode": meta["mode"],
            "defaults": dict(meta["defaults"]),
            "schema": {k: {"type": _param_type(v)} for k, v in meta["defaults"].items()},
        }
        for key, meta in STRATEGY_REGISTRY.items()
    ]
    return {"strategies": strategies}
