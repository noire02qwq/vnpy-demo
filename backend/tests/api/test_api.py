# tests/api/test_api.py
"""API 层端到端测试:monkeypatch 数据层与会话工厂,覆盖 spec §8 全部端点。"""
import pytest
from fastapi.testclient import TestClient

import app.engine.service as svc
from app.main import app
from tests.fixtures.synth import make_bars, v_shape_closes


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient(无 with → lifespan 不执行)+ 注入 tmp SQLite 与合成 K 线。"""
    from app.db.session import init_session_factory

    monkeypatch.setattr(svc, "_load_symbol_bars", lambda sym, a, b, w: make_bars(v_shape_closes(120), start=a))
    monkeypatch.setattr("app.main.get_session_factory", lambda: init_session_factory(tmp_path / "t.db"))
    return TestClient(app)


BODY = {
    "symbol": "TEST", "start": "2023-01-02", "end": "2023-12-31", "initial_capital": 100000,
    "strategy": {"type": "ema_cross", "params": {"fast_period": 5, "slow_period": 20}, "entry_pct": 100.0,
                 "entry_basis": "total"},
}


def test_run_and_history(client) -> None:
    r = client.post("/api/v1/backtests", json=BODY)
    assert r.status_code == 200, r.text
    out = r.json()
    assert {"metrics", "curves", "candles", "trades"} <= set(out)
    assert "stats_raw" not in out  # 非 JSON 安全且不在 spec §8 契约
    assert "max_drawdown" in out["metrics"] and "max_drawdown_amount" in out["metrics"]  # Task 16 双口径
    rid = out["id"]

    r2 = client.get("/api/v1/backtests")
    assert r2.json()["total"] == 1

    r3 = client.get(f"/api/v1/backtests/{rid}")
    assert r3.json()["id"] == rid

    assert client.delete(f"/api/v1/backtests/{rid}").status_code == 204
    assert client.get(f"/api/v1/backtests/{rid}").status_code == 404


def test_bad_type_400(client) -> None:
    bad = dict(BODY, strategy={"type": "nope", "params": {}})
    r = client.post("/api/v1/backtests", json=bad)
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_PARAMS"


def test_bad_date_400(client) -> None:
    r = client.post("/api/v1/backtests", json=dict(BODY, start="not-a-date"))
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_PARAMS"


def test_cost_unknown_key_400(client) -> None:
    # spec §8 已移除 commission_fixed:未知键显式 400,不静默忽略
    cost = {"commission_rate": 0.001, "slippage": 0.01, "commission_fixed": 1.0}
    r = client.post("/api/v1/backtests", json=dict(BODY, cost=cost))
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_PARAMS"


def test_start_after_end_400(client) -> None:
    # start>=end 前置 400(model_validator),不再透传 service 层
    r = client.post("/api/v1/backtests", json=dict(BODY, start="2023-12-31", end="2023-01-02"))
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_PARAMS"


def test_start_equals_end_400(client) -> None:
    r = client.post("/api/v1/backtests", json=dict(BODY, start="2023-01-02", end="2023-01-02"))
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_PARAMS"


def test_cors_healthz(client) -> None:
    """I1:CORS 中间件挂载——跨域 Origin 请求回 allow-origin 头。"""
    r = client.get("/healthz", headers={"Origin": "http://localhost:8081"})
    assert r.status_code == 200
    assert "access-control-allow-origin" in r.headers


def test_meta_schema_enum_and_integer(client) -> None:
    """I5:meta schema——str 键带 enum、int 值为 integer、float 为 number。"""
    r = client.get("/api/v1/meta/strategies")
    by_type = {s["type"]: s for s in r.json()["strategies"]}
    assert by_type["dca"]["schema"]["interval"] == {"type": "string", "enum": ["weekly", "biweekly", "monthly"]}
    assert by_type["turtle"]["schema"]["entry_days"] == {"type": "integer", "minimum": 1}
    assert by_type["turtle"]["schema"]["risk_pct"] == {"type": "number"}
    assert by_type["ema_tpsl"]["schema"]["entry_basis"] == {"type": "string", "enum": ["total", "cash"]}
    assert by_type["ema_tpsl"]["schema"]["entry_pct"] == {"type": "number"}
    assert by_type["ema_tpsl"]["schema"]["am_size"] == {"type": "integer", "minimum": 1}


def test_meta_strategies(client) -> None:
    r = client.get("/api/v1/meta/strategies")
    types = {s["type"] for s in r.json()["strategies"]}
    assert types == {"macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl", "turtle", "dca"}


def test_data_fetch(client) -> None:
    r = client.post("/api/v1/data/fetch", json={"symbol": "TEST", "start": "2023-01-02", "end": "2023-12-31"})
    assert r.status_code == 200
    assert r.json()["rows"] == 120
