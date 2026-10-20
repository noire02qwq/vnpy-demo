# tests/data/test_validate.py
import numpy as np
import pandas as pd
import pytest

from app.core.errors import AppError, ErrorCode
from app.data.validate import check_symbol, validate_ohlcv


def make_df(rows: list[tuple], tz: str | None = None) -> pd.DataFrame:
    idx = pd.DatetimeIndex([r[0] for r in rows], name="Date")
    if tz:
        idx = idx.tz_localize(tz)
    return pd.DataFrame(
        [{"open": r[1], "high": r[2], "low": r[3], "close": r[4], "volume": r[5]} for r in rows], index=idx
    )


def test_symbol_rules() -> None:
    assert check_symbol("AAPL") == "AAPL"
    assert check_symbol("BRK-B") == "BRK-B"
    assert check_symbol("^GSPC") == "^GSPC"
    with pytest.raises(AppError) as e:
        check_symbol("bad!")
    assert e.value.code == ErrorCode.INVALID_SYMBOL


def test_ok_and_tz_strip() -> None:
    rows = [(f"2023-01-{d:02d}", 10, 11, 9, 10.5, 100) for d in range(1, 16)]  # 15 行 ≥ warmup(5)+10
    df = make_df(rows, tz="America/New_York")
    out = validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert out.index.tz is None
    assert len(out) == 15


def test_ohlc_violation() -> None:
    df = make_df([("2023-01-03", 10, 9, 8, 10.5, 100)])  # high < open
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=0)
    assert e.value.code == ErrorCode.RANGE_TOO_SHORT  # 行数闸门先于 OHLC 检查触发


def test_ohlc_violation_after_gate() -> None:
    rows = [(f"2023-01-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 16)]
    df = make_df(rows)
    df.iloc[7, df.columns.get_loc("high")] = 5  # high < open,行数闸门已通过
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert e.value.code == ErrorCode.NO_DATA


def test_too_short() -> None:
    rows = [(f"2023-01-0{d}", 10, 11, 9, 10, 100) for d in range(1, 8)]
    with pytest.raises(AppError) as e:
        validate_ohlcv(make_df(rows), "AAPL", warmup_bars=100)
    assert e.value.code == ErrorCode.RANGE_TOO_SHORT


def test_nan_volume_rejected() -> None:
    rows = [(f"2023-01-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 16)]
    df = make_df(rows)
    df.iloc[7, df.columns.get_loc("volume")] = np.nan
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert e.value.code == ErrorCode.NO_DATA


def test_negative_volume_rejected() -> None:
    rows = [(f"2023-01-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 16)]
    df = make_df(rows)
    df.iloc[7, df.columns.get_loc("volume")] = -1
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert e.value.code == ErrorCode.NO_DATA


def test_missing_column_rejected() -> None:
    rows = [(f"2023-01-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 16)]
    df = make_df(rows).drop(columns=["volume"])
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert e.value.code == ErrorCode.NO_DATA


def test_nan_dropped() -> None:
    rows = [(f"2023-02-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 22)]  # 21 行 - 1 NaN = 20
    df = make_df(rows)
    df.iloc[3, df.columns.get_loc("close")] = np.nan
    out = validate_ohlcv(df, "AAPL", warmup_bars=10)
    assert len(out) == 20
