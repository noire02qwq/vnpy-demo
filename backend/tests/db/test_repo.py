import pytest

from app.db.models import RunModel  # noqa: F401
from app.db.repo import delete_run, get_run, list_runs, save_run
from app.db.session import init_session_factory


@pytest.fixture
def session_factory(tmp_path):
    return init_session_factory(tmp_path / "t.db")


def _result(i: int):
    from app.engine.service import BacktestResultData

    return BacktestResultData(
        request={"symbol": "AAPL", "n": i},
        metrics={"total_return": 0.1 * i},
        curves={"dates": ["2023-01-02"], "equity": [100.0], "position_value": [0.0], "benchmark": [0.0]},
        candles={"dates": ["2023-01-02"]},
        trades=[],
        stats_raw={"total_trade_count": i},
    )


def test_save_get_roundtrip(session_factory) -> None:
    with session_factory() as s:
        save_run(s, _result(1), "run1")
        s.commit()
    with session_factory() as s:
        out = get_run(s, "run1")
        assert out and out["request"]["n"] == 1 and out["metrics"]["total_return"] == 0.1


def test_list_and_delete(session_factory) -> None:
    with session_factory() as s:
        for i in range(5):
            save_run(s, _result(i), f"run{i}")
        s.commit()
    with session_factory() as s:
        items, total = list_runs(s, page=1, page_size=3)
        assert total == 5 and len(items) == 3 and "curves" not in items[0]
        assert delete_run(s, "run0")
        assert not delete_run(s, "nope")
