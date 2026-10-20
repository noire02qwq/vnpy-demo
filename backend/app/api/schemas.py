# app/api/schemas.py
"""API 请求模型(spec §8 契约):校验失败经 main 装配统一转 400 BAD_PARAMS。"""
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.strategies.registry import STRATEGY_REGISTRY

# API 形态白名单直接取自注册表键集(注册表为唯一映射源,避免两处漂移)
STRATEGY_TYPES = tuple(STRATEGY_REGISTRY)
# entry_pct 仅对 6 个信号形态有意义(turtle/dca 忽略该字段)
SIGNAL_TYPES = {"macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl"}


class StrategySpec(BaseModel):
    type: Literal[STRATEGY_TYPES]
    params: dict[str, Any] = Field(default_factory=dict)
    entry_pct: float = 100.0
    entry_basis: Literal["total", "cash"] = "total"

    @model_validator(mode="after")
    def check_entry(self) -> "StrategySpec":
        if self.type in SIGNAL_TYPES and not (0 < self.entry_pct <= 100):
            raise ValueError("entry_pct 必须在 (0,100]")
        return self


class CostConfig(BaseModel):
    # spec §8 已移除 commission_fixed;extra="forbid" 让未知键显式 400 而非静默忽略
    model_config = ConfigDict(extra="forbid")

    commission_rate: float = Field(default=0.001, ge=0)
    slippage: float = Field(default=0.01, ge=0)


class BacktestRequest(BaseModel):
    symbol: str
    start: date  # pydantic 自动 ISO 解析,非法日期 → 422 → 统一转 400 BAD_PARAMS
    end: date
    initial_capital: float = Field(gt=0)
    strategy: StrategySpec
    benchmark_symbol: str = "^GSPC"
    cost: CostConfig = Field(default_factory=CostConfig)
    warmup_bars: int = Field(default=100, ge=20, le=1000)


class FetchRequest(BaseModel):
    symbol: str
    start: date
    end: date
