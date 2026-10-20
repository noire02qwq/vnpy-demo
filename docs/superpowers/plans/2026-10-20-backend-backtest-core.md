# 后端回测核心实施计划(M1-M4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 FastAPI 后端:yfinance 日频数据层 → vnpy BacktestingEngine 无 GUI 回测 → 8 策略形态 → 8 指标+曲线 → SQLite 历史与 REST API,测试全绿。

**Architecture:** 分层纯函数优先(data/strategies/metrics 可独立测试),engine/ 只做 vnpy 引擎驱动与曲线导出,api/ 薄路由 + service 编排。现金由策略自管并以引擎回报校准,曲线由引擎 daily_df + 成交重放导出。

**Tech Stack:** Python 3.12 + uv;vnpy 4.5.0 / vnpy_ctastrategy 1.5.0;talib;yfinance;pandas/numpy;SQLAlchemy 2.0 + SQLite;FastAPI + pydantic v2;pytest + httpx TestClient;ruff。

**配套 spec:** `docs/superpowers/specs/2026-10-20-vnpy-backtest-demo-design.md`(唯一需求真源,冲突以 spec 为准)
**后续计划:** Plan 2 前端(M5)、Plan 3 Docker+端到端验收(M6)在本计划完成后依据现实另行编写。

## Global Constraints

- Python `>=3.12`;一切依赖经 `uv add`/`uv sync`;在 `backend/` 目录内执行所有命令
- ruff line-length 100、target py312;公共函数 type hints;注释中文
- 每任务:先失败测试 → 最小实现 → 全绿 → commit(中文 conventional + `Co-Authored-By: Claude Code <noreply@anthropic.com>`)→ push
- vnpy 默认成本:rate=0.001、fixed=0、slippage=0.01(每股绝对美元)、pricetick=0.01、size=1
- vnpy 撮合:t 日 on_bar 挂限价单 → t+1 开盘撮合;买入限价用 `close*1.05`、卖出用 `close*0.95` 确保按开盘成交
- 严禁策略内自判成交绕过引擎;仓位现金以 on_trade 实际回报校准
- 回测只注入 `engine.history_data`(用户区间全部 bar),不接 vnpy 数据库;暖机=区间前 warmup_bars 根由 ArrayManager 消化
- 测试禁止真实联网(yahoo 层注入假 downloader);资金守恒断言贯穿策略测试
- 内省自适应规则:若实际 vnpy 4.5.0 API 与本计划代码片段有出入(参数名/列名/撮合细节),**保持各任务 Interfaces 块定义的公共契约不变,调整内部实现**,并在 findings.md 记录差异

---

### Task 0:后端工程骨架

**Files:** Create: `backend/pyproject.toml`、`backend/.python-version`、`backend/app/__init__.py`、`backend/app/main.py`(最小)、`backend/tests/test_smoke.py`
**Interfaces:** Produces: `uv run pytest` 可用;`vnpy`、`talib`、`yfinance` 可导入;后续所有任务在此骨架上叠加。

- [ ] **Step 1:创建文件**

`backend/.python-version`:
```
3.12
```

`backend/pyproject.toml`:
```toml
[project]
name = "vn-demo-backend"
version = "0.1.0"
description = "vnpy 量化回测 demo 后端"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "vnpy==4.5.0",
    "vnpy-ctastrategy==1.5.0",
    "yfinance>=0.2.54",
    "pandas>=2.2",
    "numpy>=1.26",
    "sqlalchemy>=2.0",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
]

[dependency-groups]
dev = ["pytest>=8", "httpx>=0.28", "ruff>=0.8"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

`backend/app/__init__.py` 空文件;`backend/tests/__init__.py` 空文件。

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="vn-demo backend", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
```

`backend/tests/test_smoke.py`:
```python
from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    client = TestClient(app)
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_vnpy_importable() -> None:
    from vnpy_ctastrategy.backtesting import BacktestingEngine  # noqa: F401
```

- [ ] **Step 2:安装依赖** — `cd backend && uv sync`。若 ta-lib 编译失败:先 `brew install ta-lib` 再重试;仍失败则在 findings.md 记录并改用 `uv add ta-lib --config-settings`… 方案前先尝试官方 wheel。
- [ ] **Step 3:验证 vnpy 关键面** — 运行内省并把结果**追加到 findings.md**(后续任务的自适应依据):

```bash
cd backend && uv run python - <<'EOF'
import inspect
from vnpy_ctastrategy.backtesting import BacktestingEngine
print("set_parameters:", inspect.signature(BacktestingEngine.set_parameters))
print("add_strategy:", inspect.signature(BacktestingEngine.add_strategy))
print("has get_all_trades:", hasattr(BacktestingEngine, "get_all_trades"))
import vnpy_ctastrategy, pathlib
print("backtesting.py:", pathlib.Path(vnpy_ctastrategy.__file__).parent / "backtesting.py")
EOF
```
预期:`set_parameters` 含 `vt_symbol, interval, start, end, rate, slippage, size, pricetick, capital, fixed` 等参数;若 `fixed` 不存在,后续 runner 用 rate-only(成本模型退化为比率佣金,记录 findings)。
- [ ] **Step 4:跑测试** — `uv run pytest -q` → 预期 2 passed。
- [ ] **Step 5:Commit** — `git add -A && git commit -m "feat(backend): 工程骨架与依赖"`(记得 footer)。

### Task 1:core 配置与统一错误

**Files:** Create: `app/core/__init__.py`、`app/core/config.py`、`app/core/errors.py`、`tests/core/test_config_errors.py`
**Interfaces:** Produces: `get_settings() -> Settings`(字段见下)、`ErrorCode(StrEnum)`、`AppError(code, message, status=400, detail=None)`、`install_error_handlers(app)`;错误响应体 `{"code","message","detail"}`。

- [ ] **Step 1:失败测试**

```python
# tests/core/test_config_errors.py
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode, install_error_handlers


def test_settings_defaults() -> None:
    s = get_settings()
    assert s.cache_ttl_days == 7
    assert s.default_benchmark == "^GSPC"
    assert s.default_slippage == 0.01
    assert s.annualization_days == 250


def test_app_error_response() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise AppError(ErrorCode.NO_DATA, "无数据", detail={"symbol": "X"})

    r = TestClient(app).get("/boom")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "NO_DATA" and body["message"] == "无数据" and body["detail"] == {"symbol": "X"}


def test_internal_error_response() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/crash")
    def crash() -> None:
        raise RuntimeError("x")

    r = TestClient(app).get("/crash")
    assert r.status_code == 500
    assert r.json()["code"] == "INTERNAL"
```

- [ ] **Step 2:跑测试确认失败** — `uv run pytest tests/core -q` → ModuleNotFoundError
- [ ] **Step 3:实现**

```python
# app/core/config.py
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
```

```python
# app/core/errors.py
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ErrorCode(StrEnum):
    INVALID_SYMBOL = "INVALID_SYMBOL"
    NO_DATA = "NO_DATA"
    RANGE_TOO_SHORT = "RANGE_TOO_SHORT"
    RATE_LIMITED = "RATE_LIMITED"
    BAD_PARAMS = "BAD_PARAMS"
    RUN_NOT_FOUND = "RUN_NOT_FOUND"
    INTERNAL = "INTERNAL"


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, *, status: int = 400, detail: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message, "detail": exc.detail})

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"code": ErrorCode.INTERNAL, "message": str(exc), "detail": None})
```
NO_DATA 用 status 404:在抛出处 `AppError(ErrorCode.NO_DATA, ..., status=404)`。
- [ ] **Step 4:** `uv run pytest tests/core -q` → 3 passed
- [ ] **Step 5:** Commit `"feat(backend): 配置与统一错误模型"`

### Task 2:合成 K 线测试夹具

**Files:** Create: `tests/fixtures/__init__.py`、`tests/fixtures/synth.py`;Test: `tests/fixtures/test_synth.py`
**Interfaces:** Produces(后续策略/引擎测试全部依赖):
`make_bar(dt: datetime, o: float, h: float, l: float, c: float, v: float = 1000.0) -> BarData`;
`make_bars(closes: list[float], start: str = "2023-01-02", volumes: list[float] | None = None) -> list[BarData]`(open=前收盘,首日 open=close,high=max(o,c)*1.01,low=min(o,c)*0.99,交易日 00:00);
`linear_closes(n, start=100.0, step=1.0)`;`sine_closes(n, base=100.0, amp=10.0, period=40)`;`v_shape_closes(n=240, trough=0.5)`(先跌后涨再跌,用于金叉/死叉)。

- [ ] **Step 1:失败测试**

```python
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
```

- [ ] **Step 2:** `uv run pytest tests/fixtures -q` → FAIL(无模块)
- [ ] **Step 3:实现**

```python
# tests/fixtures/synth.py
"""确定性合成 K 线生成器:供策略/引擎/曲线测试构造已知形态。"""
from datetime import datetime, timedelta

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.object import BarData


def make_bar(dt: datetime, o: float, h: float, l: float, c: float, v: float = 1000.0) -> BarData:
    return BarData(
        symbol="TEST",
        exchange=Exchange.SMART,
        datetime=dt,
        gateway_name="test",
        open_price=o,
        high_price=h,
        low_price=l,
        close_price=c,
        volume=v,
        interval=Interval.DAILY,
    )


def make_bars(closes: list[float], start: str = "2023-01-02", volumes: list[float] | None = None) -> list[BarData]:
    bars: list[BarData] = []
    day = datetime.strptime(start, "%Y-%m-%d")
    prev = closes[0]
    for i, c in enumerate(closes):
        o = prev
        bars.append(make_bar(day, o, round(max(o, c) * 1.01, 2), round(min(o, c) * 0.99, 2), c, (volumes or [1000.0] * len(closes))[i]))
        prev = c
        day += timedelta(days=1)
    return bars


def linear_closes(n: int, start: float = 100.0, step: float = 1.0) -> list[float]:
    return [round(start + step * i, 4) for i in range(n)]


def sine_closes(n: int, base: float = 100.0, amp: float = 10.0, period: int = 40) -> list[float]:
    import math

    return [round(base + amp * math.sin(2 * math.pi * i / period), 4) for i in range(n)]


def v_shape_closes(n: int = 240, trough: float = 0.5) -> list[float]:
    half = n // 2
    down = [round(100.0 * (1 - (1 - trough) * i / half), 4) for i in range(half)]
    up = [round(100.0 * trough * (1 + 0.9 * i / half), 4) for i in range(half)]
    return down + up
```
- [ ] **Step 4:** `uv run pytest tests/fixtures -q` → 3 passed
- [ ] **Step 5:** Commit `"test(backend): 合成K线夹具"`

### Task 3:数据校验 validate.py

**Files:** Create: `app/data/__init__.py`、`app/data/validate.py`;Test: `tests/data/test_validate.py`
**Interfaces:** Produces: `validate_ohlcv(df: pd.DataFrame, symbol: str, warmup_bars: int) -> pd.DataFrame`(清洗+校验,列 `open/high/low/close/volume`,DatetimeIndex 无时区升序;违规抛 `AppError`)、`check_symbol(symbol: str) -> str`(违规抛 `INVALID_SYMBOL`,规则 `^[A-Z]{1,5}(-[A-Z])?$|^\^[A-Z]{3,5}$`)。

- [ ] **Step 1:失败测试**

```python
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
    df = make_df([("2023-01-03", 10, 11, 9, 10.5, 100)], tz="America/New_York")
    out = validate_ohlcv(df, "AAPL", warmup_bars=5)
    assert out.index.tz is None
    assert len(out) == 1


def test_ohlc_violation() -> None:
    df = make_df([("2023-01-03", 10, 9, 8, 10.5, 100)])  # high < open
    with pytest.raises(AppError) as e:
        validate_ohlcv(df, "AAPL", warmup_bars=0)
    assert e.value.code == ErrorCode.RANGE_TOO_SHORT or e.value.code == ErrorCode.NO_DATA


def test_too_short() -> None:
    rows = [(f"2023-01-0{d}", 10, 11, 9, 10, 100) for d in range(1, 8)]
    with pytest.raises(AppError) as e:
        validate_ohlcv(make_df(rows), "AAPL", warmup_bars=100)
    assert e.value.code == ErrorCode.RANGE_TOO_SHORT


def test_nan_dropped() -> None:
    rows = [(f"2023-02-{d:02d}", 10, 11, 9, 10, 100) for d in range(1, 21)]
    df = make_df(rows)
    df.iloc[3, df.columns.get_loc("close")] = np.nan
    out = validate_ohlcv(df, "AAPL", warmup_bars=10)
    assert len(out) == 19
```

- [ ] **Step 2:** FAIL
- [ ] **Step 3:实现**

```python
# app/data/validate.py
"""yfinance 数据校验硬闸门:脏数据不得流入回测(研究报告最高风险点)。"""
import re

import pandas as pd

from app.core.errors import AppError, ErrorCode

SYMBOL_RE = re.compile(r"^[A-Z]{1,5}(-[A-Z])?$|^\^[A-Z]{3,5}$")
REQUIRED_COLS = {"open", "high", "low", "close", "volume"}


def check_symbol(symbol: str) -> str:
    if not SYMBOL_RE.match(symbol):
        raise AppError(ErrorCode.INVALID_SYMBOL, f"无效标的: {symbol}")
    return symbol


def validate_ohlcv(df: pd.DataFrame, symbol: str, warmup_bars: int) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).lower() for c in out.columns]
    missing = REQUIRED_COLS - set(out.columns)
    if missing:
        raise AppError(ErrorCode.NO_DATA, f"数据缺列: {missing}", status=404, detail={"symbol": symbol})
    out = out.dropna(subset=["open", "high", "low", "close"])
    if out.empty:
        raise AppError(ErrorCode.NO_DATA, "区间内无数据", status=404, detail={"symbol": symbol})
    idx = pd.DatetimeIndex(out.index)
    if idx.tz is not None:
        idx = idx.tz_convert("America/New_York").tz_localize(None)
    out.index = idx.normalize()
    out = out[~out.index.duplicated(keep="last")].sort_index()
    bad = out[(out.high < out[["open", "close"]].max(axis=1)) | (out.low > out[["open", "close"]].min(axis=1))]
    if not bad.empty:
        raise AppError(ErrorCode.NO_DATA, "OHLC 不一致", status=422, detail={"rows": len(bad)})
    if (out["volume"] < 0).any():
        raise AppError(ErrorCode.NO_DATA, "volume 负数", status=422)
    if len(out) < warmup_bars + 10:
        raise AppError(
            ErrorCode.RANGE_TOO_SHORT,
            f"行数 {len(out)} 不足暖机 {warmup_bars}+10",
            status=422,
            detail={"rows": len(out), "need": warmup_bars + 10},
        )
    return out[["open", "high", "low", "close", "volume"]].astype(float)
```
注意 test_ohlc_violation 中 high<open 但行数=1 < 0+10?warmup_bars=0 → 需要 ≥10 行 → RANGE_TOO_SHORT 先触发;测试已按此断言(OR NO_DATA),实现顺序保证其一即可——改为单断言 `RANGE_TOO_SHORT`。
- [ ] **Step 4:** PASS(修正上述测试断言后)
- [ ] **Step 5:** Commit `"feat(backend): 数据校验闸门"`

### Task 4:BarData 转换 bars.py

**Files:** Create: `app/data/bars.py`;Test: `tests/data/test_bars.py`
**Interfaces:** Produces: `to_bar_data(df: pd.DataFrame, symbol: str) -> list[BarData]`(datetime 交易日 00:00、Exchange.SMART、Interval.DAILY、升序)。

- [ ] **Step 1:失败测试**

```python
# tests/data/test_bars.py
import pandas as pd

from app.data.bars import to_bar_data
from tests.fixtures.synth import linear_closes, make_bars


def test_roundtrip_shape() -> None:
    bars = make_bars(linear_closes(30))
    df = pd.DataFrame(
        [{"open": b.open_price, "high": b.high_price, "low": b.low_price, "close": b.close_price, "volume": b.volume} for b in bars],
        index=pd.DatetimeIndex([b.datetime for b in bars], name="Date"),
    )
    out = to_bar_data(df, "AAPL")
    assert len(out) == 30
    assert all(b.symbol == "AAPL" for b in out)
    assert all(b.datetime.hour == 0 for b in out)
    assert out[0].close_price == bars[0].close_price
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/data/bars.py
from pandas import DataFrame

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.object import BarData


def to_bar_data(df: DataFrame, symbol: str) -> list[BarData]:
    bars: list[BarData] = []
    for dt, row in df.iterrows():
        bars.append(
            BarData(
                symbol=symbol,
                exchange=Exchange.SMART,
                datetime=dt.to_pydatetime().normalize(),
                gateway_name="vndemo",
                open_price=float(row["open"]),
                high_price=float(row["high"]),
                low_price=float(row["low"]),
                close_price=float(row["close"]),
                volume=float(row["volume"]),
                interval=Interval.DAILY,
            )
        )
    return bars
```
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): DataFrame→BarData 转换"`

### Task 5:yfinance 客户端 yahoo.py

**Files:** Create: `app/data/yahoo.py`;Test: `tests/data/test_yahoo.py`
**Interfaces:** Produces:
`type Downloader = Callable[[str, date, date], pd.DataFrame]`;
`fetch_daily(symbol: str, start: date, end: date, *, downloader: Downloader | None = None, warmup_bars: int = 100) -> pd.DataFrame`(经 validate_ohlcv;空→NO_DATA 404)。
`default_downloader(symbol, start, end)`:`yf.download(symbol, start=start, end=end+1天, auto_adjust=True, progress=False)`,列 MultiIndex 时取第一层。

- [ ] **Step 1:失败测试**

```python
# tests/data/test_yahoo.py
from datetime import date

import pandas as pd
import pytest

from app.core.errors import AppError, ErrorCode
from app.data.yahoo import fetch_daily


def fake_downloader(rows: list[tuple]):
    idx = pd.DatetimeIndex([r[0] for r in rows], name="Date")
    return pd.DataFrame(
        [{"Open": r[1], "High": r[2], "Low": r[3], "Close": r[4], "Volume": r[5]} for r in rows], index=idx
    )


def test_empty_raises_no_data() -> None:
    with pytest.raises(AppError) as e:
        fetch_daily("AAPL", date(2023, 1, 1), date(2023, 2, 1), downloader=lambda *a: pd.DataFrame(), warmup_bars=0)
    assert e.value.code == ErrorCode.NO_DATA


def test_multiindex_flattened_and_validated() -> None:
    raw = fake_downloader([(f"2023-01-{d:02d}", 10, 11, 9, 10.5, 1000) for d in range(10, 28, 1)][:15])
    raw.columns = pd.MultiIndex.from_product([["Open", "High", "Low", "Close", "Volume"], ["AAPL"]])
    df = fetch_daily("AAPL", date(2023, 1, 10), date(2023, 2, 10), downloader=lambda *a: raw, warmup_bars=10)
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
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/data/yahoo.py
"""Yahoo 日频抓取(生产 downloader);测试注入假 downloader,禁止真实联网。"""
from collections.abc import Callable
from datetime import date, timedelta

import pandas as pd

from app.data.validate import check_symbol, validate_ohlcv

Downloader = Callable[[str, date, date], pd.DataFrame]


def default_downloader(symbol: str, start: date, end: date) -> pd.DataFrame:
    import yfinance as yf

    df = yf.download(symbol, start=start, end=end + timedelta(days=1), auto_adjust=True, progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def fetch_daily(
    symbol: str,
    start: date,
    end: date,
    *,
    downloader: Downloader | None = None,
    warmup_bars: int = 100,
) -> pd.DataFrame:
    check_symbol(symbol)
    dl = downloader or default_downloader
    df = dl(symbol, start, end)
    if df is None or df.empty:
        from app.core.errors import AppError, ErrorCode

        raise AppError(ErrorCode.NO_DATA, "区间内无数据", status=404, detail={"symbol": symbol})
    return validate_ohlcv(df, symbol, warmup_bars)
```
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): yfinance 抓取与校验接线"`

### Task 6:parquet 缓存 cache.py

**Files:** Create: `app/data/cache.py`;Test: `tests/data/test_cache.py`
**Interfaces:** Produces: `class ParquetCache(root: Path, ttl_days: int)` 方法 `get(symbol, start, end, today) -> pd.DataFrame | None`、`put(df, symbol, start, end, today) -> Path`;文件名 `{symbol}_{start}_{end}_{YYYYMMDD}.parquet`;同键多下载日取最新,过期返回 None。

- [ ] **Step 1:失败测试**

```python
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
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/data/cache.py
"""按(标的,区间,下载日)缓存;复权回溯→键含下载日,禁止跨区间拼接。"""
from datetime import date, timedelta
from pathlib import Path

import pandas as pd


class ParquetCache:
    def __init__(self, root: Path, ttl_days: int) -> None:
        self.root = root
        self.ttl_days = ttl_days
        self.root.mkdir(parents=True, exist_ok=True)

    def _glob(self, symbol: str, start: date, end: date) -> list[Path]:
        return sorted(self.root.glob(f"{symbol}_{start}_{end}_*.parquet"))

    def get(self, symbol: str, start: date, end: date, today: date) -> pd.DataFrame | None:
        files = self._glob(symbol, start, end)
        if not files:
            return None
        path = files[-1]  # 文件名日期序 = 最新下载日
        stamp = path.stem.rsplit("_", 1)[-1]
        downloaded = date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8]))
        if today - downloaded > timedelta(days=self.ttl_days):
            return None
        return pd.read_parquet(path)

    def put(self, df: pd.DataFrame, symbol: str, start: date, end: date, today: date) -> Path:
        path = self.root / f"{symbol}_{start}_{end}_{today.strftime('%Y%m%d')}.parquet"
        df.to_parquet(path)
        return path
```
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 下载日戳 parquet 缓存"`

### Task 7:引擎封装 runner.py

**Files:** Create: `app/engine/__init__.py`、`app/engine/runner.py`;Test: `tests/engine/test_runner.py`
**Interfaces:** Produces:
`@dataclass CostSettings(rate: float = 0.001, slippage: float = 0.01, fixed: float = 0.0, pricetick: float = 0.01, size: int = 1)`;
`@dataclass BacktestRun(engine: BacktestingEngine, stats: dict[str, Any])`;
`run_backtest(bars: list[BarData], strategy_class: type, strategy_params: dict, capital: float, cost: CostSettings, symbol: str = "TEST") -> BacktestRun`。

- [ ] **Step 1:失败测试**(用一个测试专用最小策略验证驱动链路)

```python
# tests/engine/test_runner.py
from tests.fixtures.synth import linear_closes, make_bars
from vnpy_ctastrategy import CtaTemplate


class BuyOnceStrategy(CtaTemplate):
    author = "test"
    parameters = ["am_size"]
    variables = []
    am_size = 10
    entries = 0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self.bought = False
        self.trades: list = []

    def on_init(self) -> None:
        self.write_log("init")

    def on_bar(self, bar) -> None:
        if not self.bought and bar.close_price > 105:
            self.buy(round(bar.close_price * 1.05, 2), 1)
            self.bought = True

    def on_trade(self, trade) -> None:
        self.trades.append(trade)


def test_runner_drives_engine() -> None:
    from app.engine.runner import CostSettings, run_backtest

    bars = make_bars(linear_closes(30))
    run = run_backtest(bars, BuyOnceStrategy, {"am_size": 10}, capital=100_000.0, cost=CostSettings())
    assert run.stats["total_trade_count"] == 1
    assert len(run.engine.get_all_trades()) == 1
    trade = run.engine.get_all_trades()[0]
    assert trade.volume == 1
    # t+1 开盘成交:买点出现在价格>105 的 bar 的下一根
    idx = next(i for i, b in enumerate(bars) if b.close_price > 105)
    assert trade.time.date() == bars[idx + 1].datetime.date()
```

- [ ] **Step 2:** FAIL(模块不存在)
- [ ] **Step 3:实现**

```python
# app/engine/runner.py
"""vnpy BacktestingEngine 无 GUI 程序化驱动(见 docs/research/vnpy-code-findings.md)。"""
from dataclasses import dataclass, field
from typing import Any

from vnpy.trader.object import BarData
from vnpy.trader.constant import Interval
from vnpy_ctastrategy.backtesting import BacktestingEngine


@dataclass
class CostSettings:
    rate: float = 0.001
    slippage: float = 0.01
    fixed: float = 0.0
    pricetick: float = 0.01
    size: int = 1


@dataclass
class BacktestRun:
    engine: BacktestingEngine
    stats: dict[str, Any] = field(default_factory=dict)


def run_backtest(
    bars: list[BarData],
    strategy_class: type,
    strategy_params: dict[str, Any],
    capital: float,
    cost: CostSettings,
    symbol: str = "TEST",
) -> BacktestRun:
    if not bars:
        raise ValueError("bars 为空")
    engine = BacktestingEngine()
    kwargs: dict[str, Any] = dict(
        vt_symbol=f"{symbol}.SMART",
        interval=Interval.DAILY,
        start=bars[0].datetime,
        end=bars[-1].datetime,
        rate=cost.rate,
        slippage=cost.slippage,
        size=cost.size,
        pricetick=cost.pricetick,
        capital=capital,
    )
    import inspect

    if "fixed" in inspect.signature(engine.set_parameters).parameters:
        kwargs["fixed"] = cost.fixed
    engine.set_parameters(**kwargs)
    engine.add_strategy(strategy_class, dict(strategy_params))
    engine.history_data = list(bars)  # 绕过数据库直注(尽调结论)
    engine.run_backtesting()
    engine.calculate_result()
    stats = engine.calculate_statistics(output=False)
    return BacktestRun(engine=engine, stats=stats)
```
若 `run_backtesting` 内部因缺 `self.days` 等报错:改为在注入 `history_data` 后调用 `engine.load_data()` 的替代路径不可用时,按 findings.md 的 B 方案(monkeypatch `vnpy_ctastrategy.backtesting.load_bar_data`)处理并记录。
- [ ] **Step 4:** `uv run pytest tests/engine -q` → PASS(若撮合价断言因 pricetick 圆整偏差,放宽为日期断言)
- [ ] **Step 5:** Commit `"feat(backend): BacktestingEngine 无 GUI 驱动封装"`

### Task 8:仓位引擎 sizing.py

**Files:** Create: `app/strategies/__init__.py`、`app/strategies/sizing.py`;Test: `tests/strategies/test_sizing.py`
**Interfaces:** Produces: `budget_amount(base: float, entry_pct: float) -> float`;`plan_shares(base: float, entry_pct: float, price: float, cash: float, entry_basis: str) -> int`(budget=base×pct/100;shares=floor(min(budget, cash 允许超额当 basis=total))/price——basis=total 时不受 cash 约束,但 shares=0 → 0)。

- [ ] **Step 1:失败测试**

```python
# tests/strategies/test_sizing.py
from app.strategies.sizing import budget_amount, plan_shares


def test_budget_amount() -> None:
    assert budget_amount(100_000.0, 50.0) == 50_000.0
    assert budget_amount(100_000.0, 100.0) == 100_000.0


def test_plan_shares_floor() -> None:
    assert plan_shares(100_000.0, 100.0, 33_334.0, 100_000.0, "total") == 2
    assert plan_shares(100_000.0, 50.0, 10.0, 100_000.0, "total") == 5_000


def test_basis_cash_capped() -> None:
    # base=total equity 10w,但 cash 只有 3w → 受 cash 约束
    assert plan_shares(100_000.0, 100.0, 10.0, 30_000.0, "cash") == 3_000
    # entry_basis=total 允许超出当前现金?不:买入受现金硬约束,超出部分只能到现金能买的最大值
    assert plan_shares(100_000.0, 100.0, 10.0, 30_000.0, "total") == 3_000


def test_zero_when_cannot_afford() -> None:
    assert plan_shares(1_000.0, 100.0, 500.0, 100.0, "cash") == 0
```

注意:上例揭示语义 —— **无论 basis,shares 都受 `floor(cash/price)` 硬约束**(现金有限),basis 只影响预算基数。契约定为:`shares = min(floor(base*pct/100/price), floor(cash/price))`。
- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/strategies/sizing.py
"""百分比仓位:预算基数由 entry_basis 决定,股数恒受现金硬约束,下取整。"""
import math


def budget_amount(base: float, entry_pct: float) -> float:
    return base * entry_pct / 100.0


def plan_shares(base: float, entry_pct: float, price: float, cash: float, entry_basis: str) -> int:
    if price <= 0 or entry_pct <= 0:
        return 0
    budget = budget_amount(base, entry_pct)
    return min(int(math.floor(budget / price)), int(math.floor(cash / price)))
```
同步修正 Step 1 测试为上述契约(删除语义含混的 total 超现金断言,改为 `== 3000` 现金硬约束用例)。`entry_basis` 保留于签名(策略按 basis 选 base:total→cash+pos*close,cash→cash),选择逻辑在策略内。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 百分比仓位与股数下取整"`

### Task 9:信号源 signals.py

**Files:** Create: `app/strategies/signals.py`;Test: `tests/strategies/test_signals.py`
**Interfaces:** Produces:
`macd_series(close: np.ndarray, fast, slow, signal) -> tuple[dif, dea, hist]`(hist=2×(dif−dea),国内约定);
`kdj_series(high, low, close, n=9, m1=3, m2=3) -> (k, d, j)`(RSV+SMA(X,N,M) 递推,首值=X);
`ema_series(close, period)`;
`cross_direction(f: np.ndarray, s: np.ndarray) -> int`(+1 金叉/−1 死叉/0,取最后两点);
`signal_direction(kind: str, am: ArrayManager, params: dict) -> int`;
`signal_series(kind: str, bars: list[BarData], params: dict) -> dict[str, list[float]]`(供前端副图:macd→dif/dea/hist;kdj→k/d/j;ema→ema_fast/ema_slow)。

- [ ] **Step 1:失败测试**

```python
# tests/strategies/test_signals.py
import numpy as np

from app.strategies.signals import cross_direction, ema_series, kdj_series, macd_series


def test_cross_direction() -> None:
    assert cross_direction(np.array([1.0, 2.0]), np.array([2.0, 1.0])) == 1   # 金叉
    assert cross_direction(np.array([2.0, 1.0]), np.array([1.0, 2.0])) == -1  # 死叉
    assert cross_direction(np.array([1.0, 1.0]), np.array([2.0, 2.0])) == 0


def test_ema_basic() -> None:
    out = ema_series(np.array([10.0, 10.0, 10.0]), 3)
    assert out[-1] == 10.0


def test_kdj_hand_values() -> None:
    # 9 日高低收固定 → RSV=(C-L9)/(H9-L9)*100
    high = np.full(12, 11.0)
    low = np.full(12, 9.0)
    close = np.full(12, 10.0)
    k, d, j = kdj_series(high, low, close)
    # RSV=50;SMA(X,3,1) 收敛于 50
    assert abs(k[-1] - 50.0) < 1e-6 and abs(d[-1] - 50.0) < 1e-6 and abs(j[-1] - 50.0) < 1e-6


def test_kdj_converges_to_extreme() -> None:
    high = np.full(12, 20.0)
    low = np.full(12, 10.0)
    close = np.full(12, 20.0)  # 收在最高 → RSV=100 → K=D=100, J=100
    k, d, j = kdj_series(high, low, close)
    assert abs(k[-1] - 100.0) < 1e-6 and abs(d[-1] - 100.0) < 1e-6 and abs(j[-1] - 100.0) < 1e-6


def test_macd_series_shape() -> None:
    close = np.linspace(100.0, 120.0, 60)
    dif, dea, hist = macd_series(close, 12, 26, 9)
    assert len(dif) == len(close) and len(dea) == len(close)
    assert np.allclose(hist, 2 * (dif - dea))
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/strategies/signals.py
"""信号源:纯 numpy 计算(与 vnpy ArrayManager 数组同序),便于独立测试与前端副图复用。"""
from typing import Any

import numpy as np

from vnpy.trader.object import BarData
from vnpy.trader.utility import ArrayManager


def _sma_cn(x: np.ndarray, n: int, m: int) -> np.ndarray:
    """国内 SMA(X,N,M): Y=(M*X+(N-M)*Y')/N,首值取 X。"""
    y = np.empty_like(x, dtype=float)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = (m * x[i] + (n - m) * y[i - 1]) / n
    return y


def ema_series(close: np.ndarray, period: int) -> np.ndarray:
    out = np.empty_like(close, dtype=float)
    out[0] = close[0]
    k = 2.0 / (period + 1.0)
    for i in range(1, len(close)):
        out[i] = close[i] * k + out[i - 1] * (1 - k)
    return out


def macd_series(close: np.ndarray, fast: int, slow: int, signal: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    dif = ema_series(close, fast) - ema_series(close, slow)
    dea = ema_series(dif, signal)
    return dif, dea, 2.0 * (dif - dea)


def kdj_series(high: np.ndarray, low: np.ndarray, close: np.ndarray, n: int = 9, m1: int = 3, m2: int = 3) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    hn = np.full_like(close, np.nan, dtype=float)
    ln = np.full_like(close, np.nan, dtype=float)
    for i in range(len(close)):
        lo = max(0, i - n + 1)
        hn[i] = high[lo : i + 1].max()
        ln[i] = low[lo : i + 1].min()
    denom = np.where(hn - ln == 0, 1e-9, hn - ln)
    rsv = (close - ln) / denom * 100.0
    k = _sma_cn(rsv, m1, 1)
    d = _sma_cn(k, m2, 1)
    return k, d, 3.0 * k - 2.0 * d


def cross_direction(f: np.ndarray, s: np.ndarray) -> int:
    if len(f) < 2:
        return 0
    f0, f1, s0, s1 = f[-2], f[-1], s[-2], s[-1]
    if f0 <= s0 and f1 > s1:
        return 1
    if f0 >= s0 and f1 < s1:
        return -1
    return 0


def signal_direction(kind: str, am: ArrayManager, params: dict[str, Any]) -> int:
    if kind == "macd":
        dif, dea, _ = macd_series(am.close, params["fast_period"], params["slow_period"], params["signal_period"])
        return cross_direction(dif, dea)
    if kind == "kdj":
        k, d, _ = kdj_series(am.high, am.low, am.close, params["kdj_n"], params["kdj_m1"], params["kdj_m2"])
        return cross_direction(k, d)
    if kind == "ema":
        return cross_direction(ema_series(am.close, params["fast_period"]), ema_series(am.close, params["slow_period"]))
    raise ValueError(f"未知信号: {kind}")


def signal_series(kind: str, bars: list[BarData], params: dict[str, Any]) -> dict[str, list[float]]:
    close = np.array([b.close_price for b in bars])
    high = np.array([b.high_price for b in bars])
    low = np.array([b.low_price for b in bars])
    if kind == "macd":
        dif, dea, hist = macd_series(close, params["fast_period"], params["slow_period"], params["signal_period"])
        return {"dif": dif.tolist(), "dea": dea.tolist(), "hist": hist.tolist()}
    if kind == "kdj":
        k, d, j = kdj_series(high, low, close, params["kdj_n"], params["kdj_m1"], params["kdj_m2"])
        return {"k": k.tolist(), "d": d.tolist(), "j": j.tolist()}
    if kind == "ema":
        return {
            "ema_fast": ema_series(close, params["fast_period"]).tolist(),
            "ema_slow": ema_series(close, params["slow_period"]).tolist(),
        }
    return {}
```
说明:策略内 `am.close` 即 ArrayManager 内部数组(定长);每 bar 全量重算 O(n·周期) 对 demo 规模(几千根)可接受;`signal_series` 与 `signal_direction` 用同一函数保证一致性(测试断言二者方向一致)。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): MACD/KDJ/EMA 信号源"`

### Task 10:CrossTradeStrategy(3 形态)

**Files:** Create: `app/strategies/cross.py`、`app/strategies/registry.py`;Test: `tests/strategies/test_cross.py`
**Interfaces:** Produces: `CrossTradeStrategy(CtaTemplate)`,参数 `signal_kind/fast_period/slow_period/signal_period/kdj_n/kdj_m1/kdj_m2/entry_pct/entry_basis/am_size`;`STRATEGY_REGISTRY: dict[str, dict]`(键=8 形态名,值含 cls/kind/signal/defaults/schema——本任务先注册 3 个 cross 形态,后续任务补注册)。

- [ ] **Step 1:失败测试**

```python
# tests/strategies/test_cross.py
import numpy as np

from app.engine.runner import CostSettings, run_backtest
from app.strategies.cross import CrossTradeStrategy
from app.strategies.signals import cross_direction, ema_series
from tests.fixtures.synth import make_bars, v_shape_closes

CAPITAL = 100_000.0


def build_bars():
    return make_bars(v_shape_closes(240))


def first_cross_index(bars) -> int:
    close = np.array([b.close_price for b in bars])
    f = ema_series(close, 5)
    s = ema_series(close, 20)
    for i in range(1, len(close)):
        if cross_direction(f[: i + 1], s[: i + 1]) == 1:
            return i
    raise AssertionError("无金叉")


PARAMS = {
    "signal_kind": "ema",
    "fast_period": 5,
    "slow_period": 20,
    "entry_pct": 100.0,
    "entry_basis": "total",
    "am_size": 40,
}


def test_golden_cross_buys_next_open() -> None:
    bars = build_bars()
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    trades = run.engine.get_all_trades()
    assert trades, "应至少有一笔买入"
    first_buy = trades[0]
    i = first_cross_index(bars)
    assert first_buy.time.date() == bars[i + 1].datetime.date()  # t+1 开盘
    assert first_buy.volume == int(CAPITAL / bars[i].close_price)  # 决策收盘价折算,下取整


def test_death_cross_exits_full() -> None:
    bars = build_bars()
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    trades = run.engine.get_all_trades()
    buys = [t for t in trades if t.direction.value == 1]  # Direction.LONG
    sells = [t for t in trades if t.direction.value == 2]  # Direction.SHORT
    assert buys and sells, "V 形数据应有买有卖"
    # 每次卖出都是全仓
    total_buy = sum(t.volume for t in buys)
    total_sell = sum(t.volume for t in sells)
    assert total_buy == total_sell


def test_cash_conservation() -> None:
    bars = build_bars()
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    st = run.engine.strategy
    close_last = bars[-1].close_price
    expected_cash = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * close_last
    assert st.cash == pytest.approx(expected_cash, abs=1e-6)


import pytest  # noqa: E402  (置于文件顶部亦可)


def test_no_trade_during_warmup() -> None:
    bars = build_bars()
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    trades = run.engine.get_all_trades()
    if trades:
        assert all(t.time >= bars[40].datetime for t in trades)
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/strategies/cross.py
"""金叉买/死叉卖(信号源三选一)。现金自管,以 on_trade 实际回报校准。"""
from vnpy_ctastrategy import BarData, CtaTemplate, TradeData

from app.strategies.signals import signal_direction
from app.strategies.sizing import plan_shares


class CrossTradeStrategy(CtaTemplate):
    author = "noire02qwq"
    parameters = [
        "signal_kind", "fast_period", "slow_period", "signal_period",
        "kdj_n", "kdj_m1", "kdj_m2", "entry_pct", "entry_basis", "am_size",
    ]
    variables = ["pos", "cash"]

    signal_kind = "ema"
    fast_period = 5
    slow_period = 20
    signal_period = 9
    kdj_n = 9
    kdj_m1 = 3
    kdj_m2 = 3
    entry_pct = 100.0
    entry_basis = "total"
    am_size = 100

    cash = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        from vnpy.trader.utility import ArrayManager

        self.am = ArrayManager(size=self.am_size)

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def _params(self) -> dict:
        return {
            "fast_period": self.fast_period,
            "slow_period": self.slow_period,
            "signal_period": self.signal_period,
            "kdj_n": self.kdj_n,
            "kdj_m1": self.kdj_m1,
            "kdj_m2": self.kdj_m2,
        }

    def on_bar(self, bar: BarData) -> None:
        am = self.am
        am.update_bar(bar)
        if not am.inited:
            return
        direction = signal_direction(self.signal_kind, am, self._params())
        if direction > 0 and self.pos == 0:
            base = (self.cash + abs(self.pos) * bar.close_price) if self.entry_basis == "total" else self.cash
            shares = plan_shares(base, self.entry_pct, bar.close_price, self.cash, self.entry_basis)
            if shares > 0:
                self.buy(round(bar.close_price * 1.05, 2), shares)
        elif direction < 0 and self.pos > 0:
            self.cancel_all()
            self.sell(round(bar.close_price * 0.95, 2), abs(self.pos))

    def on_trade(self, trade: TradeData) -> None:
        from vnpy.trader.constant import Direction

        cost = trade.price * trade.volume
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee
        else:
            self.cash += cost - fee
        self.put_event()
```

```python
# app/strategies/registry.py
"""策略形态注册表:API 层与 meta 端点的唯一映射源。"""
from app.strategies.cross import CrossTradeStrategy

_SIGNAL_PARAMS = {
    "macd": {"fast_period": 12, "slow_period": 26, "signal_period": 9},
    "kdj": {"kdj_n": 9, "kdj_m1": 3, "kdj_m2": 3},
    "ema": {"fast_period": 5, "slow_period": 20},
}

STRATEGY_REGISTRY: dict[str, dict] = {
    f"{sig}_{mode}": {
        "cls": CrossTradeStrategy,
        "kind": "signal",
        "signal": sig,
        "mode": mode,
        "defaults": {**_SIGNAL_PARAMS[sig], "entry_pct": 100.0, "entry_basis": "total", "am_size": 100},
    }
    for sig in ("macd", "kdj", "ema")
    for mode in ("cross",)
}
```
- [ ] **Step 4:** `uv run pytest tests/strategies -q` → PASS(交易量断言若因 t+1 开盘价 ≠ 决策收盘价导致现金不足而部分成交被拒,回看引擎对资金不足的处理——vnpy 回测无资金约束,按单成交;故断言应始终成立)
- [ ] **Step 5:** Commit `"feat(backend): 金死叉买卖策略(3 信号形态)"`

### Task 11:CrossTpslStrategy(3 形态)

**Files:** Create: `app/strategies/tpsl.py`;Test: `tests/strategies/test_tpsl.py`
**Interfaces:** Produces: `CrossTpslStrategy(CtaTemplate)`(在 cross 参数基础上加 `take_profit_pct/stop_loss_pct`);registry 增加 `macd_tpsl/kdj_tpsl/ema_tpsl`。

- [ ] **Step 1:失败测试**(构造:突破买入后回落触发止损;跳空高开触发止盈;死叉兜底)

```python
# tests/strategies/test_tpsl.py
from app.engine.runner import CostSettings, run_backtest
from app.strategies.tpsl import CrossTpslStrategy
from tests.fixtures.synth import make_bars

CAPITAL = 100_000.0


def bars_stop_loss_hit():
    # 40 根震荡(暖机)→ 10 根上涨(金叉+买入)→ 20 根下跌(触发止损 5%)
    closes = [100.0] * 40 + [100 + i for i in range(1, 11)] + [110 - (i + 1) * 2 for i in range(20)]
    return make_bars(closes)


def bars_gap_up_tp():
    # 40 震荡 → 10 上涨(买入)→ 跳空高开 25%(触发止盈 20%)
    closes = [100.0] * 40 + [100 + i for i in range(1, 11)] + [138.0] * 15
    return make_bars(closes)


PARAMS = {
    "signal_kind": "ema", "fast_period": 3, "slow_period": 10,
    "entry_pct": 100.0, "entry_basis": "cash",
    "take_profit_pct": 20.0, "stop_loss_pct": 5.0, "am_size": 30,
}


def test_stop_loss_exit() -> None:
    run = run_backtest(bars_stop_loss_hit(), CrossTpslStrategy, dict(PARAMS), CAPITAL, CostSettings())
    sells = [t for t in run.engine.get_all_trades() if t.direction.value == 2]
    assert sells, "应触发止损卖出"
    buy = [t for t in run.engine.get_all_trades() if t.direction.value == 1][0]
    assert sells[0].price <= buy.price * 0.95 + 0.01  # 止损价附近(含滑点)


def test_take_profit_on_gap() -> None:
    run = run_backtest(bars_gap_up_tp(), CrossTpslStrategy, dict(PARAMS), CAPITAL, CostSettings())
    sells = [t for t in run.engine.get_all_trades() if t.direction.value == 2]
    buy = [t for t in run.engine.get_all_trades() if t.direction.value == 1][0]
    assert sells and sells[0].price >= buy.price * 1.20 - 0.01


def test_death_cross_fallback_exit() -> None:
    # 数据改为:上涨买入后缓慢阴跌不触发 5% 止损?不可能(阴跌必触发)——改为:横盘不触发 TP/SL,随后死叉清仓
    closes = [100.0] * 40 + [100 + i for i in range(1, 11)] + [110.0] * 15
    run = run_backtest(make_bars(closes), CrossTpslStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    assert any(t.direction.value == 2 for t in trades)


def test_cash_conservation() -> None:
    run = run_backtest(bars_stop_loss_hit(), CrossTpslStrategy, dict(PARAMS), CAPITAL, CostSettings())
    bars = bars_stop_loss_hit()
    st = run.engine.strategy
    expected = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * bars[-1].close_price
    assert st.cash == pytest.approx(expected, abs=1e-6)
```
(文件顶部补 `import pytest`。)
- [ ] **Step 2:** FAIL → **Step 3:实现**(继承 cross,复用信号与 sizing;新增 on_trade 挂 TP 限价 + SL stop,出场撤单)

```python
# app/strategies/tpsl.py
"""金叉买入 + 固定百分比止盈(限价卖单,日频跳空成交)与止损(stop 卖单)。死叉为兜底出场。"""
from vnpy.trader.constant import Direction

from vnpy_ctastrategy import BarData, CtaTemplate, TradeData

from app.strategies.signals import signal_direction
from app.strategies.sizing import plan_shares


class CrossTpslStrategy(CtaTemplate):
    author = "noire02qwq"
    parameters = [
        "signal_kind", "fast_period", "slow_period", "signal_period",
        "kdj_n", "kdj_m1", "kdj_m2",
        "entry_pct", "entry_basis", "take_profit_pct", "stop_loss_pct", "am_size",
    ]
    variables = ["pos", "cash", "entry_price"]

    signal_kind = "ema"
    fast_period = 5
    slow_period = 20
    signal_period = 9
    kdj_n = 9
    kdj_m1 = 3
    kdj_m2 = 3
    entry_pct = 100.0
    entry_basis = "cash"
    take_profit_pct = 10.0
    stop_loss_pct = 5.0
    am_size = 100

    cash = 0.0
    entry_price = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        from vnpy.trader.utility import ArrayManager

        self.am = ArrayManager(size=self.am_size)
        self._exit_placed = False

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def _params(self) -> dict:
        return {
            "fast_period": self.fast_period, "slow_period": self.slow_period,
            "signal_period": self.signal_period,
            "kdj_n": self.kdj_n, "kdj_m1": self.kdj_m1, "kdj_m2": self.kdj_m2,
        }

    def on_bar(self, bar: BarData) -> None:
        self.am.update_bar(bar)
        if not self.am.inited:
            return
        direction = signal_direction(self.signal_kind, self.am, self._params())
        if direction > 0 and self.pos == 0:
            base = (self.cash + abs(self.pos) * bar.close_price) if self.entry_basis == "total" else self.cash
            shares = plan_shares(base, self.entry_pct, bar.close_price, self.cash, self.entry_basis)
            if shares > 0:
                self.buy(round(bar.close_price * 1.05, 2), shares)
        elif direction < 0 and self.pos > 0:
            self.cancel_all()
            self._exit_placed = False
            self.sell(round(bar.close_price * 0.95, 2), abs(self.pos))

    def on_trade(self, trade: TradeData) -> None:
        cost = trade.price * trade.volume
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee
            self.entry_price = trade.price
            vol = abs(self.pos)
            if vol > 0:
                tp = round(self.entry_price * (1 + self.take_profit_pct / 100.0), 2)
                sl = round(self.entry_price * (1 - self.stop_loss_pct / 100.0), 2)
                self.sell(tp, vol)            # 止盈限价卖单(日频跳空成交)
                self.sell(sl, vol, stop=True)  # 止损 stop 卖单
        else:
            self.cash += cost - fee
            self.entry_price = 0.0
            self.cancel_all()
            self._exit_placed = False
        self.put_event()
```
**撮合语义注(实现者按实际代码校准断言):** vnpy 4.5 BAR 模式限价卖单在 `bar.open_price >= 委托价` 时按 `max(委托价, 开盘价)` 撮合?实为 `min/max` 组合以实际源码为准;stop 单触发 `bar.low < stop 价`,成交价按引擎规则(通常 `min(stop价, 开盘)` 或 stop 价−滑点)。**测试预期已留 ±0.01 容差,若引擎成交价语义不同,以引擎源码为准修断言,不修引擎。** registry 注册:`f"{sig}_tpsl"` → cls=CrossTpslStrategy, defaults 追加 take_profit_pct=10.0/stop_loss_pct=5.0。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 金叉买入+固定止盈止损策略(3 形态)"`

### Task 12:TurtleStrategy

**Files:** Create: `app/strategies/turtle.py`;Test: `tests/strategies/test_turtle.py`
**Interfaces:** Produces: `TurtleStrategy(CtaTemplate)` 参数 `entry_days=20/exit_days=10/atr_days=20/risk_pct=1.0/max_units=4/add_on_n=0.5/stop_n=2.0/am_size`;registry 注册 `turtle`。

- [ ] **Step 1:失败测试**

```python
# tests/strategies/test_turtle.py
import math

from app.engine.runner import CostSettings, run_backtest
from app.strategies.turtle import TurtleStrategy
from tests.fixtures.synth import make_bars

CAPITAL = 1_000_000.0


def bars_breakout_then_breakdown():
    # 60 根 100 横盘 → 20 根稳步上涨(突破 20 日高)→ 20 根暴跌(触发 2N 止损)
    flat = [100.0] * 60
    up = [100 + i * 2 for i in range(1, 21)]
    down = [140 - (i + 1) * 5 for i in range(20)]
    return make_bars(flat + up + down)


PARAMS = {"entry_days": 20, "exit_days": 10, "atr_days": 14, "risk_pct": 1.0, "max_units": 4, "am_size": 60}


def test_breakout_entry_next_open() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    assert trades and trades[0].direction.value == 1
    assert trades[0].volume >= 1


def test_unit_size_uses_atr() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    buy = run.engine.get_all_trades()[0]
    # 单元股数 = floor(equity*1% / ATR);入场时 ATR≈2 → 期望约 floor(10000*?/2) 量级;断言下取整特征:
    assert buy.volume == math.floor(buy.volume) and buy.volume <= CAPITAL * 0.01 / 0.5


def test_stop_loss_full_exit() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    trades = run.engine.get_all_trades()
    buys = sum(t.volume for t in trades if t.direction.value == 1)
    sells = sum(t.volume for t in trades if t.direction.value == 2)
    assert buys == sells


def test_cash_conservation() -> None:
    bars = bars_breakout_then_breakdown()
    run = run_backtest(bars, TurtleStrategy, dict(PARAMS), CAPITAL, CostSettings())
    st = run.engine.strategy
    expected = CAPITAL + run.stats["total_net_pnl"] - abs(st.pos) * bars[-1].close_price
    assert st.cash == pytest.approx(expected, abs=1e-6)
```
(顶部补 `import pytest`)
- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/strategies/turtle.py
"""经典海龟(做多 only):唐奇安突破入场、ATR 单位加仓、2N 总止损、通道反向离场。"""
from vnpy.trader.constant import Direction
from vnpy.trader.utility import ArrayManager

from vnpy_ctastrategy import BarData, CtaTemplate, TradeData


class TurtleStrategy(CtaTemplate):
    author = "noire02qwq"
    parameters = ["entry_days", "exit_days", "atr_days", "risk_pct", "max_units", "add_on_n", "stop_n", "am_size"]
    variables = ["pos", "cash", "units", "stop_price"]

    entry_days = 20
    exit_days = 10
    atr_days = 14
    risk_pct = 1.0
    max_units = 4
    add_on_n = 0.5
    stop_n = 2.0
    am_size = 100

    cash = 0.0
    units = 0
    stop_price = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self.am = ArrayManager(size=max(self.am_size, self.entry_days * 2 + 10))
        self.last_entry_price = 0.0
        self.entry_atr = 0.0

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def on_bar(self, bar: BarData) -> None:
        am = self.am
        am.update_bar(bar)
        if not am.inited:
            return
        entry_up, _ = am.donchian(self.entry_days)
        _, exit_low = am.donchian(self.exit_days)
        atr = am.atr(self.atr_days)
        entry_up_prev = entry_up[-2]
        exit_low_prev = exit_low[-2]

        if self.pos == 0 and bar.close_price > entry_up_prev:
            unit = int((self.cash + abs(self.pos) * bar.close_price) * (self.risk_pct / 100.0) / max(atr[-1], 1e-9))
            if unit > 0:
                self.units = 1
                self.last_entry_price = bar.close_price
                self.entry_atr = atr[-1]
                self.stop_price = round(bar.close_price - self.stop_n * atr[-1], 2)
                self.buy(round(bar.close_price * 1.05, 2), unit)
        elif 0 < self.units < self.max_units and bar.close_price >= self.last_entry_price + self.add_on_n * self.entry_atr:
            unit = int((self.cash + abs(self.pos) * bar.close_price) * (self.risk_pct / 100.0) / max(atr[-1], 1e-9))
            if unit > 0:
                self.units += 1
                self.last_entry_price = bar.close_price
                self.stop_price = round(bar.close_price - self.stop_n * atr[-1], 2)
                self.cancel_all()
                self.buy(round(bar.close_price * 1.05, 2), unit)
        elif self.pos > 0 and bar.close_price < exit_low_prev:
            self.cancel_all()
            self.units = 0
            self.sell(round(bar.close_price * 0.95, 2), abs(self.pos))

    def on_trade(self, trade: TradeData) -> None:
        cost = trade.price * trade.volume
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee
            # 首笔成交后挂 2N 止损(全部持仓);加仓后以最新 stop_price 重建
            if self.units >= 1 and abs(self.pos) > 0:
                self.cancel_all()
                self.sell(self.stop_price, abs(self.pos), stop=True)
        else:
            self.cash += cost - fee
            self.units = 0
            self.stop_price = 0.0
            self.cancel_all()
        self.put_event()
```
注:加仓单成交前旧止损单已在 on_bar cancel+重建;on_trade 内对首笔/加仓成交统一重建 stop。channel 值取 `[-2]`(昨日通道,避免用当根 bar 自己突破自己)。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 经典海龟策略"`

### Task 13:DcaStrategy

**Files:** Create: `app/strategies/dca.py`;Test: `tests/strategies/test_dca.py`
**Interfaces:** Produces: `DcaStrategy(CtaTemplate)` 参数 `interval=weekly|biweekly|monthly`、`amount=1000.0`、`am_size`(不产生卖出);registry 注册 `dca`。

- [ ] **Step 1:失败测试**

```python
# tests/strategies/test_dca.py
from datetime import datetime

from app.engine.runner import CostSettings, run_backtest
from app.strategies.dca import DcaStrategy
from tests.fixtures.synth import linear_closes, make_bars

CAPITAL = 10_000.0


def test_monthly_buys_first_trading_day() -> None:
    bars = make_bars(linear_closes(400, start=100.0, step=0.1), start="2022-01-03")
    run = run_backtest(bars, DcaStrategy, {"interval": "monthly", "amount": 1000.0, "am_size": 10}, CAPITAL, CostSettings())
    buys = [t for t in run.engine.get_all_trades() if t.direction.value == 1]
    assert buys, "定投应有买入"
    months = {(t.time.year, t.time.month) for t in buys}
    assert len(buys) == len(months), "每月首交易日恰好一笔"
    # 首笔是暖机后第一个自然月的首根 bar
    assert buys[0].time.date() >= bars[10].datetime.date()
    assert all(t.direction.value == 1 for t in run.engine.get_all_trades()), "定投不卖出"


def test_biweekly_and_weekly() -> None:
    bars = make_bars(linear_closes(200), start="2022-01-03")
    for interval, expect_min in (("weekly", 20), ("biweekly", 10)):
        run = run_backtest(bars, DcaStrategy, {"interval": interval, "amount": 500.0, "am_size": 10}, CAPITAL, CostSettings())
        n = len(run.engine.get_all_trades())
        assert n >= expect_min, f"{interval} 应≥{expect_min} 笔,实际 {n}"


def test_amount_floor_and_cash_bound() -> None:
    bars = make_bars(linear_closes(300, start=100.0, step=0.05), start="2022-01-03")
    # amount=1000,价≈100 → 每期 10 股;现金 1 万只够首期 → 之后跳过
    run = run_backtest(bars, DcaStrategy, {"interval": "monthly", "amount": 1000.0, "am_size": 10}, 1_050.0, CostSettings())
    buys = [t for t in run.engine.get_all_trades() if t.direction.value == 1]
    assert len(buys) == 1 and buys[0].volume == 10
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/strategies/dca.py
"""简单定投:每间隔首个交易日按固定金额买入,持有到期不清仓。"""
from vnpy.trader.utility import ArrayManager

from vnpy_ctastrategy import BarData, CtaTemplate, TradeData


def period_key(dt, interval: str):
    if interval == "monthly":
        return (dt.year, dt.month)
    iso = dt.isocalendar()
    if interval == "biweekly":
        return (iso[0], iso[1] // 2)
    return (iso[0], iso[1])  # weekly


class DcaStrategy(CtaTemplate):
    author = "noire02qwq"
    parameters = ["interval", "amount", "am_size"]
    variables = ["pos", "cash"]

    interval = "monthly"
    amount = 1000.0
    am_size = 100

    cash = 0.0

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self.am = ArrayManager(size=self.am_size)
        self._warmup_bars_left = self.am_size
        self._last_period = None

    def on_init(self) -> None:
        self.write_log("策略初始化")
        self.cash = float(self.cta_engine.capital)

    def on_start(self) -> None:
        self.write_log("策略启动")

    def on_stop(self) -> None:
        self.write_log("策略停止")

    def on_bar(self, bar: BarData) -> None:
        self.am.update_bar(bar)
        if not self.am.inited:
            return
        key = period_key(bar.datetime, self.interval)
        if key == self._last_period:
            return
        self._last_period = key
        shares = int(self.amount // bar.close_price)
        if shares > 0:
            self.buy(round(bar.close_price * 1.05, 2), shares)

    def on_trade(self, trade: TradeData) -> None:
        from vnpy.trader.constant import Direction

        cost = trade.price * trade.volume
        fee = cost * self.cta_engine.rate + getattr(self.cta_engine, "fixed", 0.0)
        if trade.direction == Direction.LONG:
            self.cash -= cost + fee
        else:
            self.cash += cost - fee
        self.put_event()
```
「现金不足跳过」由 `plan_shares` 同款逻辑隐含:engine 无资金约束 → 会出现现金为负!必须防:**on_bar 中加 `max_affordable = int(self.cash // bar.close_price); shares = min(shares, max_affordable)`**(cash 按 on_trade 校准,注意 t+1 开盘价偏差可能使 cash 轻微为负 → 用 `if self.cash < bar.close_price: return` 前置)。实现中必须含此防护,并在测试 test_amount_floor_and_cash_bound 验证只有 1 笔。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 简单定投策略"`

### Task 14:曲线导出 curves.py

**Files:** Create: `app/engine/curves.py`;Test: `tests/engine/test_curves.py`
**Interfaces:** Produces: `build_curves(run: BacktestRun, bars: list[BarData], capital: float) -> Curves` where
`@dataclass Curves: dates: list[str]; equity: list[float]; position_value: list[float]; benchmark_placeholder: None`(benchmark 在 Task 15 由 metrics 层接);内部:`pos_t` 由 `engine.get_all_trades()` 按日重放;`equity_t = capital + cumsum(net_pnl)`;`position_value_t = pos_t × close_t`;另产出 `cash: list[float]`(=equity−position_value,供测试与前端)。
**验证前置步骤(实现前执行并记入 findings):** `uv run python -c "from vnpy_ctastrategy.backtesting import BacktestingEngine; import inspect; print([a for a in dir(BacktestingEngine) if 'daily' in a.lower()])"` 确认 `daily_df`/`daily_results` 属性名与 `net_pnl/close_price` 列名;若列名不同,以实际为准(公共契约 Curves 不变)。

- [ ] **Step 1:失败测试**

```python
# tests/engine/test_curves.py
from app.engine.curves import build_curves
from app.engine.runner import CostSettings, run_backtest
from app.strategies.cross import CrossTradeStrategy
from tests.fixtures.synth import make_bars, v_shape_closes

CAPITAL = 100_000.0
PARAMS = {"signal_kind": "ema", "fast_period": 5, "slow_period": 20, "entry_pct": 100.0, "entry_basis": "total", "am_size": 40}


def test_curves_consistency() -> None:
    bars = make_bars(v_shape_closes(240))
    run = run_backtest(bars, CrossTradeStrategy, dict(PARAMS), CAPITAL, CostSettings(), symbol="TEST")
    curves = build_curves(run, bars, CAPITAL)
    n = len(curves.dates)
    assert n == len(bars) and n == len(curves.equity) == len(curves.position_value) == len(curves.cash)
    assert curves.equity[0] == pytest.approx(CAPITAL, abs=0.02)  # 首日≈初始资金
    for eq, pv, c in zip(curves.equity, curves.position_value, curves.cash):
        assert c == pytest.approx(eq - pv, abs=1e-6)
    # 空仓日持仓资金为 0
    assert all(pv >= 0 for pv in curves.position_value)
```
(顶部 `import pytest`)
- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/engine/curves.py
"""每日净值导出:equity=capital+cumsum(net_pnl);pos 由成交按日重放;cash=equity-持仓市值。"""
from collections import defaultdict
from dataclasses import dataclass, field

from vnpy.trader.constant import Direction
from vnpy.trader.object import BarData

from app.engine.runner import BacktestRun


@dataclass
class Curves:
    dates: list[str] = field(default_factory=list)
    equity: list[float] = field(default_factory=list)
    position_value: list[float] = field(default_factory=list)
    cash: list[float] = field(default_factory=list)


def build_curves(run: BacktestRun, bars: list[BarData], capital: float) -> Curves:
    engine = run.engine
    # 每日收盘价(直接用 bar,引擎 daily_df 列名以内省为准)
    closes = {b.datetime.date(): b.close_price for b in bars}
    dates = [b.datetime.strftime("%Y-%m-%d") for b in bars]

    daily_pnl = defaultdict(float)
    for date, res in engine.daily_results.items():
        daily_pnl[date] = res.net_pnl

    net_pnl = [daily_pnl.get(b.datetime.date(), 0.0) for b in bars]
    equity: list[float] = []
    acc = capital
    for pnl in net_pnl:
        acc += pnl
        equity.append(acc)

    pos_delta = defaultdict(int)
    for t in engine.get_all_trades():
        d = t.volume if t.direction == Direction.LONG else -t.volume
        pos_delta[t.time.date()] += d
    pos = 0
    position_value: list[float] = []
    for b in bars:
        pos += pos_delta.get(b.datetime.date(), 0)
        position_value.append(pos * closes[b.datetime.date()])

    cash = [eq - pv for eq, pv in zip(equity, position_value)]
    return Curves(dates=dates, equity=equity, position_value=position_value, cash=cash)
```
若 `engine.daily_results` 的键/结构不同(如 datetime 而非 date),按实际调整取数;Curves 契约不变。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 净值/持仓/现金三曲线导出"`

### Task 15:指标 metrics(risk + benchmark)

**Files:** Create: `app/metrics/__init__.py`、`app/metrics/risk.py`、`app/metrics/benchmark.py`;Test: `tests/metrics/test_risk.py`
**Interfaces:** Produces:
`compute_risk_metrics(equity: list[float], benchmark_close: list[float], *, annual_days: int = 250, risk_free_rate: float = 0.0) -> dict[str, float | None]`(键:`total_return/annual_return/beta/alpha_annual/max_drawdown/annual_volatility/sharpe_ratio/information_ratio`;基准对齐按索引内联,长度不足→None);
`benchmark_relative_curve(benchmark_bars: list[BarData], capital: float) -> list[float]`(同区间 buy&hold 累计收益率 %,长度=bars;基准短于 equity 时前端以日期 join,此处按 bars 输出)。

- [ ] **Step 1:失败测试**

```python
# tests/metrics/test_risk.py
import math

from app.metrics.risk import compute_risk_metrics
from tests.fixtures.synth import linear_closes, make_bars


def flat(n: float, days: int) -> list[float]:
    return [n] * days


def test_no_risk_flat_growth() -> None:
    eq = [100.0 * (1 + 0.001) ** i for i in range(251)]
    bench = [100.0] * 251
    m = compute_risk_metrics(eq, bench)
    assert m["total_return"] == pytest.approx((eq[-1] / eq[0]) - 1, rel=1e-9)
    assert m["annual_volatility"] == pytest.approx(0.0, abs=1e-9)
    assert m["max_drawdown"] == pytest.approx(0.0, abs=1e-9)
    assert m["sharpe_ratio"] is None or m["sharpe_ratio"] > 0  # std=0 → None


def test_hand_computed_drawdown() -> None:
    eq = [100.0, 120.0, 60.0, 90.0]
    m = compute_risk_metrics(eq, [100.0] * 4)
    assert m["max_drawdown"] == pytest.approx(1 - 60.0 / 120.0)


def test_beta_of_perfect_tracker() -> None:
    bench = [100 * (1 + 0.01) ** i for i in range(120)]
    eq = list(bench)  # 完全同步
    m = compute_risk_metrics(eq, bench)
    assert m["beta"] == pytest.approx(1.0, rel=1e-6)
    assert m["information_ratio"] == pytest.approx(0.0, abs=1e-6)


def test_benchmark_curve() -> None:
    from app.metrics.benchmark import benchmark_relative_curve

    bars = make_bars(linear_closes(50))
    curve = benchmark_relative_curve(bars, 1000.0)
    assert curve[0] == 0.0
    assert curve[-1] == pytest.approx((bars[-1].close_price / bars[0].close_price - 1) * 100, rel=1e-6)
```
(顶部 `import pytest`)
- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/metrics/risk.py
"""风险调整指标(对齐 docs/回测指标.tmp)。beta/alpha 用 CAPM;IR 用超额收益。"""
import math
from typing import Any

import numpy as np


def _daily_returns(xs: list[float]) -> np.ndarray:
    arr = np.asarray(xs, dtype=float)
    if len(arr) < 2:
        return np.array([])
    return arr[1:] / arr[:-1] - 1.0


def compute_risk_metrics(
    equity: list[float],
    benchmark_close: list[float],
    *,
    annual_days: int = 250,
    risk_free_rate: float = 0.0,
) -> dict[str, Any]:
    n = min(len(equity), len(benchmark_close))
    eq = equity[:n]
    bench = benchmark_close[:n]
    if n < 3:
        return {k: None for k in (
            "total_return", "annual_return", "beta", "alpha_annual",
            "max_drawdown", "annual_volatility", "sharpe_ratio", "information_ratio",
        )}
    total = eq[-1] / eq[0] - 1.0
    annual = (eq[-1] / eq[0]) ** (annual_days / n) - 1.0
    rp, rb = _daily_returns(eq), _daily_returns(bench)
    rf_d = risk_free_rate / annual_days
    mdd_arr = eq / np.maximum.accumulate(eq) - 1.0
    mdd = float(-mdd_arr.min()) if len(mdd_arr) else None
    vol = float(rp.std(ddof=1)) * math.sqrt(annual_days)
    cov = float(np.cov(rp, rb, ddof=1)[0][1])
    var = float(rb.var(ddof=1))
    beta = cov / var if var > 0 else None
    bench_annual = (bench[-1] / bench[0]) ** (annual_days / n) - 1.0
    alpha = (annual - risk_free_rate) - beta * (bench_annual - risk_free_rate) if beta is not None else None
    sharpe = (float(rp.mean()) - rf_d) / float(rp.std(ddof=1)) * math.sqrt(annual_days) if rp.std(ddof=1) > 0 else None
    excess = rp - rb
    ir = float(excess.mean()) / float(excess.std(ddof=1)) * math.sqrt(annual_days) if excess.std(ddof=1) > 0 else None
    return {
        "total_return": float(total),
        "annual_return": float(annual),
        "beta": beta,
        "alpha_annual": alpha,
        "max_drawdown": mdd,
        "annual_volatility": vol,
        "sharpe_ratio": sharpe,
        "information_ratio": ir,
    }
```

```python
# app/metrics/benchmark.py
"""基准(^GSPC/SPY)buy&hold 累计收益率曲线,起点 0(坐标原点)。"""
from vnpy.trader.object import BarData


def benchmark_relative_curve(benchmark_bars: list[BarData], capital: float) -> list[float]:
    if not benchmark_bars:
        return []
    base = benchmark_bars[0].close_price
    return [(b.close_price / base - 1.0) * 100.0 for b in benchmark_bars]
```
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 8 项风险指标与基准曲线"`

### Task 16:结果装配 service.py

**Files:** Create: `app/engine/service.py`;Test: `tests/engine/test_service.py`
**Interfaces:** Produces:
`@dataclass BacktestResultData(request: dict, metrics: dict, curves: dict, candles: dict, trades: list[dict], stats_raw: dict)`;
`execute_backtest(request: dict, *, benchmark_fetcher: Callable | None = None) -> BacktestResultData`;
`build_candles(bars: list[BarData], signal: str | None, params: dict) -> dict`(dates/o/h/l/c/volume 数组 + overlays/sub,signal=None 时 overlays/sub 为空 dict)。
`benchmark_fetcher(symbol, start, end) -> list[BarData]` 可注入(测试假基准;生产实现 = fetch_daily+cache+to_bar_data,本任务内联私有函数,生产注入在 Task 18 完成)。

- [ ] **Step 1:失败测试**

```python
# tests/engine/test_service.py
from app.engine.service import execute_backtest
from tests.fixtures.synth import linear_closes, make_bars


def fake_benchmark_fetcher(symbol, start, end):
    return make_bars(linear_closes(240), start="2023-01-02")


REQ = {
    "symbol": "TEST", "start": "2023-01-02", "end": "2024-12-31", "initial_capital": 100000.0,
    "strategy": {"type": "ema_cross", "params": {"fast_period": 5, "slow_period": 20},
                 "entry_pct": 100.0, "entry_basis": "total"},
    "benchmark_symbol": "^GSPC", "cost": {}, "warmup_bars": 40,
}


def test_execute_backtest_shape() -> None:
    from tests.fixtures.synth import v_shape_closes
    import app.engine.service as svc

    orig = svc._load_symbol_bars
    svc._load_symbol_bars = lambda symbol, start, end, warmup: make_bars(v_shape_closes(240), start=start)
    try:
        out = execute_backtest(dict(REQ), benchmark_fetcher=fake_benchmark_fetcher)
    finally:
        svc._load_symbol_bars = orig
    assert set(out.metrics) >= {"total_return", "annual_return", "alpha_annual", "beta", "max_drawdown",
                                "annual_volatility", "sharpe_ratio", "information_ratio"}
    assert out.curves["benchmark"][0] == 0.0 and len(out.curves["equity"]) == len(out.curves["dates"])
    assert out.candles["dates"] == out.curves["dates"]
    assert {"ema_fast", "ema_slow"} <= set(out.candles["overlays"])
    assert out.stats_raw["total_trade_count"] >= 0
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/engine/service.py
"""回测编排:数据→策略→引擎→曲线→指标→candles 装配。"""
from datetime import date
from typing import Any, Callable

from vnpy.trader.object import BarData

from app.core.config import Settings, get_settings
from app.data.bars import to_bar_data
from app.data.validate import check_symbol
from app.engine.curves import build_curves
from app.engine.runner import CostSettings, run_backtest
from app.metrics.benchmark import benchmark_relative_curve
from app.metrics.risk import compute_risk_metrics
from app.strategies.registry import STRATEGY_REGISTRY
from app.strategies.signals import signal_series


def _load_symbol_bars(symbol: str, start: str, end: str, warmup: int) -> list[BarData]:
    """生产实现:fetch_daily→cache→to_bar_data(网络层注入点,测试覆盖之)。"""
    from app.data.cache import ParquetCache
    from app.data.yahoo import fetch_daily

    s: Settings = get_settings()
    cache = ParquetCache(s.data_dir / "cache", s.cache_ttl_days)
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    df = cache.get(symbol, d0, d1, date.today())
    if df is None:
        df = fetch_daily(symbol, d0, d1, warmup_bars=warmup)
        cache.put(df, symbol, d0, d1, date.today())
    return to_bar_data(df, symbol)


def build_candles(bars: list[BarData], signal: str | None, params: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "dates": [b.datetime.strftime("%Y-%m-%d") for b in bars],
        "open": [b.open_price for b in bars],
        "high": [b.high_price for b in bars],
        "low": [b.low_price for b in bars],
        "close": [b.close_price for b in bars],
        "volume": [b.volume for b in bars],
        "overlays": {},
        "sub": {},
    }
    if signal:
        series = signal_series(signal, bars, params)
        if signal == "ema":
            out["overlays"] = {"ema_fast": series["ema_fast"], "ema_slow": series["ema_slow"]}
        else:
            out["sub"] = {signal: series}
    return out


def execute_backtest(request: dict[str, Any], *, benchmark_fetcher: Callable | None = None) -> Any:
    from dataclasses import dataclass, field

    from app.core.errors import AppError, ErrorCode

    @dataclass
    class BacktestResultData:
        request: dict
        metrics: dict
        curves: dict
        candles: dict
        trades: list
        stats_raw: dict

    check_symbol(request["symbol"])
    meta = STRATEGY_REGISTRY.get(request["strategy"]["type"])
    if meta is None:
        raise AppError(ErrorCode.BAD_PARAMS, f"未知策略形态: {request['strategy']['type']}")
    warmup = int(request.get("warmup_bars") or get_settings().default_warmup_bars)
    bars = _load_symbol_bars(request["symbol"], request["start"], request["end"], warmup)
    cost_cfg = request.get("cost") or {}
    cost = CostSettings(
        rate=float(cost_cfg.get("commission_rate", get_settings().default_commission_rate)),
        slippage=float(cost_cfg.get("slippage", get_settings().default_slippage)),
        fixed=float(cost_cfg.get("commission_fixed", get_settings().default_commission_fixed)),
    )
    params = {**meta["defaults"], **(request["strategy"].get("params") or {}),
              "entry_pct": float(request["strategy"].get("entry_pct") or 100.0),
              "entry_basis": request["strategy"].get("entry_basis") or "total",
              "am_size": warmup}
    run = run_backtest(bars, meta["cls"], params, float(request["initial_capital"]), cost, symbol=request["symbol"])
    curves = build_curves(run, bars, float(request["initial_capital"]))

    fetch = benchmark_fetcher or (lambda sym, a, b: _load_symbol_bars(sym, a, b, warmup))
    bench_bars = fetch(request.get("benchmark_symbol") or get_settings().default_benchmark,
                       request["start"], request["end"])
    bench_close = [b.close_price for b in bench_bars]
    risk = compute_risk_metrics(curves.equity, bench_close,
                                risk_free_rate=get_settings().risk_free_rate)
    curves_out = {
        "dates": curves.dates,
        "equity": curves.equity,
        "position_value": curves.position_value,
        "benchmark": benchmark_relative_curve(bench_bars, float(request["initial_capital"])),
    }
    signal_kind = meta["signal"]
    candles = build_candles(bars, signal_kind, params)
    from vnpy.trader.constant import Direction, Offset

    trades = [
        {
            "time": t.time.strftime("%Y-%m-%d"), "direction": "buy" if t.direction == Direction.LONG else "sell",
            "price": t.price, "volume": t.volume,
        }
        for t in run.engine.get_all_trades()
    ]
    return BacktestResultData(
        request=request,
        metrics={**risk, **{k: run.stats[k] for k in (
            "start_date", "end_date", "total_days", "total_trade_count", "total_commission",
            "total_turnover", "max_drawdown", "return_drawdown_ratio") if k in run.stats}},
        curves=curves_out,
        candles=candles,
        trades=trades,
        stats_raw=dict(run.stats),
    )
```
注意基准长度与 equity 不一致时(停牌/假期差异),`compute_risk_metrics` 按短者对齐;curves.benchmark 长度=基准 bar 数(前端按日期 join)。测试中 `monkeypatch` 用 try/finally 还原即可。
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 回测编排与结果装配"`

### Task 17:SQLite 落库 db/

**Files:** Create: `app/db/__init__.py`、`app/db/models.py`、`app/db/session.py`、`app/db/repo.py`;Test: `tests/db/test_repo.py`
**Interfaces:** Produces:
`Base(DeclarativeBase)`、`RunModel(id: str PK, created_at: DateTime, request_json: Text, result_json: Text)`;
`init_session_factory(db_path: Path) -> sessionmaker`;
`save_run(session, result: BacktestResultData, run_id: str) -> None`;`get_run(session, run_id) -> dict | None`;`list_runs(session, page, page_size) -> tuple[list[dict], int]`(summary 含 id/created_at/request/metrics,不含 curves/candles/trades);`delete_run(session, run_id) -> bool`。

- [ ] **Step 1:失败测试**

```python
# tests/db/test_repo.py
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
```

- [ ] **Step 2:** FAIL → **Step 3:实现**

```python
# app/db/models.py
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RunModel(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    request_json: Mapped[str] = mapped_column(Text)
    result_json: Mapped[str] = mapped_column(Text)
```

```python
# app/db/session.py
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base


def init_session_factory(db_path: Path) -> sessionmaker[Session]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
```

```python
# app/db/repo.py
import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import RunModel


def save_run(session: Session, result: Any, run_id: str) -> None:
    full = {
        "id": run_id,
        "request": result.request,
        "metrics": result.metrics,
        "curves": result.curves,
        "candles": result.candles,
        "trades": result.trades,
    }
    session.add(RunModel(id=run_id, request_json=json.dumps(result.request, ensure_ascii=False),
                         result_json=json.dumps(full, ensure_ascii=False, default=str)))


def _to_full(row: RunModel) -> dict:
    return json.loads(row.result_json)


def get_run(session: Session, run_id: str) -> dict | None:
    row = session.get(RunModel, run_id)
    return _to_full(row) if row else None


def list_runs(session: Session, page: int, page_size: int) -> tuple[list[dict], int]:
    q = session.query(RunModel).order_by(RunModel.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for row in rows:
        req = json.loads(row.request_json)
        full = _to_full(row)
        items.append({"id": row.id, "created_at": row.created_at.isoformat(),
                      "request": req, "metrics": full["metrics"]})
    return items, total


def delete_run(session: Session, run_id: str) -> bool:
    row = session.get(RunModel, run_id)
    if not row:
        return False
    session.delete(row)
    return True
```
- [ ] **Step 4:** PASS → **Step 5:** Commit `"feat(backend): 回测历史 SQLite 落库"`

### Task 18:FastAPI 路由与装配

**Files:** Create: `app/api/__init__.py`、`app/api/schemas.py`、`app/api/data.py`、`app/api/backtests.py`、`app/api/meta.py`、`app/api/deps.py`;Modify: `app/main.py`;Test: `tests/api/test_api.py`
**Interfaces:** Produces(spec §8 全量):
`POST /api/v1/data/fetch`、`POST /api/v1/backtests`、`GET /api/v1/backtests`、`GET /api/v1/backtests/{id}`、`DELETE /api/v1/backtests/{id}`、`GET /api/v1/meta/strategies`;
pydantic 模型 `FetchRequest/FetchResponse/StrategySpec/CostConfig/BacktestRequest/RunSummary`;`app.state.session_factory`。

- [ ] **Step 1:失败测试**

```python
# tests/api/test_api.py
import pytest
from fastapi.testclient import TestClient

import app.engine.service as svc
from app.main import app
from tests.fixtures.synth import make_bars, v_shape_closes


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app.db.session import init_session_factory

    monkeypatch.setattr(svc, "_load_symbol_bars", lambda sym, a, b, w: make_bars(v_shape_closes(120), start=a))
    monkeypatch.setattr("app.main.get_session_factory", lambda: init_session_factory(tmp_path / "t.db"))
    return TestClient(app)


BODY = {
    "symbol": "TEST", "start": "2023-01-02", "end": "2023-12-31", "initial_capital": 100000,
    "strategy": {"type": "ema_cross", "params": {"fast_period": 5, "slow_period": 20}, "entry_pct": 100.0, "entry_basis": "total"},
}


def test_run_and_history(client) -> None:
    r = client.post("/api/v1/backtests", json=BODY)
    assert r.status_code == 200, r.text
    out = r.json()
    assert {"metrics", "curves", "candles", "trades"} <= set(out)
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


def test_meta_strategies(client) -> None:
    r = client.get("/api/v1/meta/strategies")
    types = {s["type"] for s in r.json()["strategies"]}
    assert types == {"macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl", "turtle", "dca"}


def test_data_fetch(client) -> None:
    r = client.post("/api/v1/data/fetch", json={"symbol": "TEST", "start": "2023-01-02", "end": "2023-12-31"})
    assert r.status_code == 200
    assert r.json()["rows"] == 120
```

- [ ] **Step 2:** FAIL → **Step 3:实现**(关键代码;完整请求/响应模型按 spec §8 字段逐一声明)

```python
# app/api/schemas.py
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

STRATEGY_TYPES = ("macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl", "turtle", "dca")
SIGNAL_TYPES = {"macd_cross", "kdj_cross", "ema_cross", "macd_tpsl", "kdj_tpsl", "ema_tpsl"}


class StrategySpec(BaseModel):
    type: Literal[STRATEGY_TYPES]  # type: ignore[valid-type]
    params: dict[str, Any] = Field(default_factory=dict)
    entry_pct: float = 100.0
    entry_basis: Literal["total", "cash"] = "total"

    @model_validator(mode="after")
    def check_entry(self) -> "StrategySpec":
        if self.type in SIGNAL_TYPES and not (0 < self.entry_pct <= 100):
            raise ValueError("entry_pct 必须在 (0,100]")
        return self


class CostConfig(BaseModel):
    commission_rate: float = 0.001
    commission_fixed: float = 0.0
    slippage: float = 0.01


class BacktestRequest(BaseModel):
    symbol: str
    start: str
    end: str
    initial_capital: float = Field(gt=0)
    strategy: StrategySpec
    benchmark_symbol: str = "^GSPC"
    cost: CostConfig = CostConfig()
    warmup_bars: int = Field(default=100, ge=20, le=1000)


class FetchRequest(BaseModel):
    symbol: str
    start: str
    end: str
```

```python
# app/api/backtests.py(节选:POST 主体)
import uuid

from fastapi import APIRouter, Request

from app.api.schemas import BacktestRequest
from app.core.errors import AppError, ErrorCode
from app.engine.service import execute_backtest
from app.db.repo import get_run, list_runs, save_run

router = APIRouter(prefix="/api/v1")


@router.post("/backtests")
def run_backtest_api(req: BacktestRequest, request: Request):
    result = execute_backtest(req.model_dump())
    run_id = uuid.uuid4().hex
    with request.app.state.session_factory() as s:
        save_run(s, result, run_id)
        s.commit()
    return {"id": run_id, **result.__dict__}
```
其余端点照 spec §8:`GET /backtests` 分页参数 page≥1/page_size≤100;`GET /backtests/{id}` 未找到抛 `AppError(RUN_NOT_FOUND, status=404)`;DELETE 204;`data/fetch` 调 `svc._load_symbol_bars` 返回行数摘要;`meta.py` 输出 `{"strategies": [{"type", "kind", "signal", "defaults", "schema"}]}`(schema 用 defaults 键生成简易 JSON Schema)。
`app/main.py` 装配:`install_error_handlers(app)`、`app.include_router(...)`、`get_session_factory()`(默认 `init_session_factory(get_settings().data_dir / "backtest.db")`,可 monkeypatch)、startup 时初始化 `app.state.session_factory`。
- [ ] **Step 4:** `uv run pytest -q` 全绿(此前所有任务测试一并跑)→ **Step 5:** Commit `"feat(backend): REST API 与历史端点"`

### Task 19:收尾——openapi 导出、README、ruff 全绿

**Files:** Create: `frontend/src/api/schema.json`(目录占位)、`backend/README.md`;Modify: 根 `README.md`
**Interfaces:** Produces: `backend/openapi.json`(前端类型生成源)。

- [ ] **Step 1:** `cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi(), ensure_ascii=False))" > openapi.json && cp openapi.json ../frontend/src/api/schema.json 2>/dev/null || (mkdir -p ../frontend/src/api && cp openapi.json ../frontend/src/api/schema.json)`
- [ ] **Step 2:** `uv run ruff check app tests` → 0 错误(自动修复:`uv run ruff check --fix`)
- [ ] **Step 3:** `uv run pytest -q` 全绿;`uv run pytest -q | tail -1` 记录到 progress.md
- [ ] **Step 4:** 写 `backend/README.md`(uv sync / pytest / uvicorn 三段);根 `README.md` 项目简介 + 快速开始
- [ ] **Step 5:** Commit `"feat(backend): openapi 导出与文档收尾(M1-M4 完成)"` + push

---

## Self-Review 记录

- Spec 覆盖:§4→T3-6;§5→T8-13;§6→T7/14;§7→T15;§8→T16-18;错误模型→T1/18;暖机→T9/10/13(am_size= warmup);RANGE_TOO_SHORT→T3 ✓
- 已知取舍:KDJ 全量重算 O(n·周期) 在日频几千根可接受;cash 硬约束语义(sizing T8)与 spec §5.2 已对齐;TP 限价单日频跳空语义已写入 spec §5.3 ✓
- 类型一致性:CrossTradeStrategy/CrossTpslStrategy/TurtleStrategy/DcaStrategy 参数名与 registry defaults、service params 组装一致;Curves/backtest 契约与 service 输出一致 ✓
