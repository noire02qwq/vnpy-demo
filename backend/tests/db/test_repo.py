import pytest

from app.db.models import RunModel
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


def test_list_runs_reads_split_columns(session_factory) -> None:
    """F7:list_runs 只依赖 request_json + metrics_json 摘要列,不再 json.loads 大 result_json。"""
    with session_factory() as s:
        save_run(s, _result(2), "runx")
        s.commit()
    with session_factory() as s:
        row = s.get(RunModel, "runx")
        assert row.metrics_json and "total_return" in row.metrics_json
        row.result_json = "corrupted-not-json"  # list_runs 不得依赖 result_json
        items, total = list_runs(s, page=1, page_size=10)
        assert total == 1 and items[0]["metrics"]["total_return"] == 0.2
        assert items[0]["request"]["symbol"] == "AAPL"
