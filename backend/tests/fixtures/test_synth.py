# tests/fixtures/test_synth.py
from datetime import datetime

from vnpy.trader.constant import Interval

from tests.fixtures.synth import make_bars, sine_closes, v_shape_closes


def test_make_bars_shapes() -> None:
    bars = make_bars([10.0, 11.0, 12.0])
    assert len(bars) == 3
    assert bars[0].interval == Interval.DAILY
    assert bars[1].open_price == 10.0 and bars[1].close_price == 11.0
    assert bars[1].high_price == round(11.0 * 1.01, 2)
    assert bars[1].datetime.hour == 0 and bars[1].datetime.minute == 0


def test_determinism() -> None:
    assert [b.close_price for b in make_bars(sine_closes(50))] == [
        b.close_price for b in make_bars(sine_closes(50))
    ]


def test_v_shape() -> None:
    closes = v_shape_closes(240)
    assert len(closes) == 240
    assert closes[0] > closes[120] < closes[180]  # 先跌后涨
