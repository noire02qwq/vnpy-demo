import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VNDEMO_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    cache_ttl_days: int = 7
    default_benchmark: str = "^GSPC"
    default_commission_rate: float = 0.001
    default_slippage: float = 0.01
    default_warmup_bars: int = 100
    annualization_days: int = 250
    risk_free_rate: float = 0.0
    # CORS 白名单(env VNDEMO_CORS_ORIGINS)。NoDecode 必须显式:pydantic-settings 对复杂类型
    # 先在 source 层强制 JSON 解码,非 JSON 字符串在 field_validator 之前就 SettingsError;
    # 挂 NoDecode 后由下方 validator 统一收 JSON 数组与逗号分隔两种写法。默认 ["*"](demo 本地开发)
    cors_origins: Annotated[list[str], NoDecode] = ["*"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                return json.loads(s)  # JSON 数组写法: '["http://a","http://b"]'
            return [item.strip() for item in s.split(",") if item.strip()]  # 逗号分隔写法
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
