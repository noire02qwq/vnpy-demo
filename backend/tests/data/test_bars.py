# tests/data/test_bars.py
import pandas as pd

from app.data.bars import to_bar_data
from tests.fixtures.synth import linear_closes, make_bars


def test_roundtrip_shape() -> None:
    bars = make_bars(linear_closes(30))
    df = pd.DataFrame(
        [
            {
                "open": b.open_price,
                "high": b.high_price,
                "low": b.low_price,
                "close": b.close_price,
                "volume": b.volume,
            }
            for b in bars
        ],
        index=pd.DatetimeIndex([b.datetime for b in bars], name="Date"),
    )
    out = to_bar_data(df, "AAPL")
    assert len(out) == 30
    assert all(b.symbol == "AAPL" for b in out)
    assert all(b.datetime.hour == 0 for b in out)
    assert out[0].close_price == bars[0].close_price
