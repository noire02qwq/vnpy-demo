# tests/data/test_cache.py
from datetime import date, timedelta

import pandas as pd

from app.data.cache import ParquetCache


def sample_df() -> pd.DataFrame:
    idx = pd.DatetimeIndex(pd.date_range("2023-01-02", periods=20))
    return pd.DataFrame({"open": 10.0, "high": 11.0, "low": 9.0, "close": 10.5, "volume": 100.0}, index=idx)


def test_put_get_roundtrip(tmp_path) -> None:
    c = ParquetCache(tmp_path, ttl_days=7)
    assert c.get("AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1)) is None
    c.put(sample_df(), "AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1))
    out = c.get("AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1))
    assert out is not None and len(out) == 20


def test_ttl_expiry(tmp_path) -> None:
    c = ParquetCache(tmp_path, ttl_days=7)
    c.put(sample_df(), "AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1))
    assert c.get("AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1) + timedelta(days=8)) is None


def test_newest_download_wins(tmp_path) -> None:
    c = ParquetCache(tmp_path, ttl_days=30)
    c.put(sample_df(), "AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 1))
    df2 = sample_df()
    df2["close"] = 99.0
    c.put(df2, "AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 2))
    out = c.get("AAPL", date(2023, 1, 1), date(2023, 2, 1), date(2023, 3, 3))
    assert out["close"].iloc[0] == 99.0
