# tests/data/test_yahoo.py
from datetime import date

import pandas as pd
import pytest

from app.core.errors import AppError, ErrorCode
from app.data.yahoo import default_downloader, fetch_daily


def fake_downloader(rows: list[tuple]):
    idx = pd.DatetimeIndex([r[0] for r in rows], name="Date")
    return pd.DataFrame(
        [{"Open": r[1], "High": r[2], "Low": r[3], "Close": r[4], "Volume": r[5]} for r in rows], index=idx
    )


def test_empty_raises_no_data() -> None:
    with pytest.raises(AppError) as e:
        fetch_daily("AAPL", date(2023, 1, 1), date(2023, 2, 1), downloader=lambda *a: pd.DataFrame(), warmup_bars=0)
    assert e.value.code == ErrorCode.NO_DATA
    assert e.value.status == 404


def test_multiindex_flattened_and_validated() -> None:
    raw = fake_downloader([(f"2023-01-{d:02d}", 10, 11, 9, 10.5, 1000) for d in range(10, 28, 1)][:15])
    raw.columns = pd.MultiIndex.from_product([["Open", "High", "Low", "Close", "Volume"], ["AAPL"]])
    # 15 行 + warmup_bars=5 恰好满足 validate 的「warmup+10」硬闸门(brief 原值 10 需 20 行,自相矛盾)
    df = fetch_daily("AAPL", date(2023, 1, 10), date(2023, 2, 10), downloader=lambda *a: raw, warmup_bars=5)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert len(df) >= 15


def test_invalid_symbol_short_circuits() -> None:
    called = {"n": 0}

    def dl(*a):
        called["n"] += 1
        return pd.DataFrame()

    with pytest.raises(AppError) as e:
        fetch_daily("bad", date(2023, 1, 1), date(2023, 1, 2), downloader=dl, warmup_bars=0)
    assert e.value.code == ErrorCode.INVALID_SYMBOL
    assert called["n"] == 0


def test_none_download_maps_to_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    # yfinance 1.7.0 download 返回 Optional[DataFrame]:None 必须映射为空表(→ NO_DATA 404),不得 500
    import yfinance as yf

    monkeypatch.setattr(yf, "download", lambda *a, **k: None)
    d0, d1 = date(2023, 1, 2), date(2023, 1, 31)
    assert default_downloader("AAPL", d0, d1).empty

    with pytest.raises(AppError) as e:
        fetch_daily("AAPL", d0, d1)
    assert e.value.code == ErrorCode.NO_DATA
    assert e.value.status == 404


def _raiser(exc: Exception):
    def _f(*a, **k):
        raise exc

    return _f


def test_rate_limit_message_maps_to_429(monkeypatch: pytest.MonkeyPatch) -> None:
    """I2:限流异常(消息匹配)→ AppError(RATE_LIMITED, 429),不再裸 500。"""
    import yfinance as yf

    monkeypatch.setattr(yf, "download", _raiser(Exception("YFRateLimitError: too many requests")))
    with pytest.raises(AppError) as e:
        fetch_daily("AAPL", date(2023, 1, 2), date(2023, 1, 31))
    assert e.value.code == ErrorCode.RATE_LIMITED
    assert e.value.status == 429


def test_rate_limit_class_maps_to_429(monkeypatch: pytest.MonkeyPatch) -> None:
    """yfinance 1.7.0 专用异常类 yfinance.exceptions.YFRateLimitError(类名匹配)。"""
    import yfinance as yf
    from yfinance.exceptions import YFRateLimitError

    monkeypatch.setattr(yf, "download", _raiser(YFRateLimitError()))
    with pytest.raises(AppError) as e:
        fetch_daily("AAPL", date(2023, 1, 2), date(2023, 1, 31))
    assert e.value.code == ErrorCode.RATE_LIMITED
    assert e.value.status == 429


def test_other_download_errors_reraise(monkeypatch: pytest.MonkeyPatch) -> None:
    """非限流异常原样 re-raise,不得吞掉改变语义。"""
    import yfinance as yf

    monkeypatch.setattr(yf, "download", _raiser(ValueError("boom")))
    with pytest.raises(ValueError, match="boom"):
        fetch_daily("AAPL", date(2023, 1, 2), date(2023, 1, 31))
