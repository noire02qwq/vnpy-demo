from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VNDEMO_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    cache_ttl_days: int = 7
    default_benchmark: str = "^GSPC"
    default_commission_rate: float = 0.001
    default_commission_fixed: float = 0.0
    default_slippage: float = 0.01
    default_warmup_bars: int = 100
    annualization_days: int = 250
    risk_free_rate: float = 0.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
