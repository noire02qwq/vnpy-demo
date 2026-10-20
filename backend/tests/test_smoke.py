from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    client = TestClient(app)
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_vnpy_importable() -> None:
    from vnpy_ctastrategy.backtesting import BacktestingEngine  # noqa: F401
