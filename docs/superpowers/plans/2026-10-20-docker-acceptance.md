# Docker 与端到端验收实施计划(M6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前后端 Docker 镜像可独立构建运行(compose 编排、真实构建冒烟),文档树完善,端到端验收清单全勾,处理前端终审遗留,达成 goal(功能全部支持、测试全绿)。

**Architecture:** 后端镜像 = python:3.12-slim + uv(--frozen --no-dev)+ ta-lib 编译层;前端镜像 = 多阶段(node 20 构建 expo export,EXPO_PUBLIC_API_BASE 构建参数)+ nginx:alpine(SPA fallback);compose 两服务独立启停 + 健康检查。

**Tech Stack:** Docker 29.6.2(daemon 已验证可用)|nginx:alpine|python:3.12-slim|node:20。

**配套 spec:** §12(Docker)、§11(验收标准)
**前置:** Plan 1(后端,终审放行)、Plan 2(前端,终审进行中——其 findings 在 Task D3 处理)

## Global Constraints

- 所有镜像构建真实执行并记录(Docker 可用);构建失败如实报告,不许只交文件
- EXPO_PUBLIC_API_BASE 以构建参数注入,默认 `http://localhost:8000`;compose 内前端默认 `http://localhost:8000`(宿主直访场景)
- commit 中文 conventional + footer `Co-Authored-By: Claude Code <noreply@anthropic.com>`;每任务验证过才提交
- ta-lib 安装:优先 wheel,失败则 slim 内编译(记录选择与耗时)

---

### Task D0:后端镜像

**Files:** Create: `docker/backend.Dockerfile`、`docker/.dockerignore`
**Interfaces:** Produces:`docker build -f docker/backend.Dockerfile -t vndemo-backend .` 可成功;`docker run --rm -p 8000:8000 vndemo-backend` 后 `curl 127.0.0.1:8000/healthz` 返回 ok。

```dockerfile
# docker/backend.Dockerfile
FROM python:3.12-slim AS base
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
# 系统层 ta-lib(编译安装;若 PyPI ta-lib wheel 覆盖 linux cp312 则可去掉此层——构建时先试 wheel 路线)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync --frozen --no-dev --no-install-project || \
    (apt-get update && apt-get install -y --no-install-recommends wget \
     && wget https://github.com/ta-lib/ta-lib/releases/download/v0.6.4/ta-lib-0.6.4-src.tar.gz \
     && tar xzf ta-lib-0.6.4-src.tar.gz && cd ta-lib-0.6.4 \
     && ./configure --prefix=/usr && make && make install \
     && cd ../.. && rm -rf ta-lib* && cd backend && uv sync --frozen --no-dev --no-install-project)

COPY backend/app ./backend/app
ENV PATH="/opt/venv/bin:$PATH" PYTHONPATH=/app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 1:** 写文件(以上为起点;ta-lib 路线二选一以实际构建成功为准,记录选择)
- [ ] **Step 2:** `docker build -f docker/backend.Dockerfile -t vndemo-backend .`(仓库根构建上下文;记录耗时)
- [ ] **Step 3:** 后台 `docker run --rm -d --name vndemo-backend-test -p 8000:8000 vndemo-backend` → `curl 127.0.0.1:8000/healthz` → `{"status":"ok"}` → `docker rm -f vndemo-backend-test`
- [ ] **Step 4:Commit** `feat(docker): 后端镜像(uv frozen + ta-lib)`

### Task D1:前端镜像(nginx + SPA fallback)

**Files:** Create: `docker/frontend.Dockerfile`、`docker/nginx.conf`
**Interfaces:** Produces:`docker build -f docker/frontend.Dockerfile --build-arg EXPO_PUBLIC_API_BASE=http://localhost:8000 -t vndemo-frontend .` 成功;运行后 `curl localhost:8080/` 200、`curl localhost:8080/history` SPA fallback 200。

```dockerfile
# docker/frontend.Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
ARG EXPO_PUBLIC_API_BASE=http://localhost:8000
ENV EXPO_PUBLIC_API_BASE=$EXPO_PUBLIC_API_BASE
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx expo export -p web

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

`docker/nginx.conf`:
```nginx
server {
  listen 8080;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri.html $uri/ /index.html;
  }
}
```

- [ ] **Step 1:** 写文件
- [ ] **Step 2:** `docker build -f docker/frontend.Dockerfile --build-arg EXPO_PUBLIC_API_BASE=http://localhost:8000 -t vndemo-frontend .`
- [ ] **Step 3:** `docker run --rm -d --name vndemo-frontend-test -p 8080:8080 vndemo-frontend` → `curl -s -o /dev/null -w "%{http_code}" localhost:8080/` = 200;`localhost:8080/history` = 200(SPA fallback)→ 清理容器
- [ ] **Step 4:Commit** `feat(docker): 前端镜像(expo export + nginx SPA fallback)`

### Task D2:compose 编排与文档

**Files:** Create: `docker/compose.yaml`、`docker/README.md`
**Interfaces:** `docker compose up -d` 两服务健康;`docker compose stop frontend` 单独停前端不影响后端。

```yaml
# docker/compose.yaml
services:
  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    ports: ["8000:8000"]
    volumes:
      - backend-data:/app/backend/data
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"]
      interval: 30s
      timeout: 5s
      retries: 3
  frontend:
    build:
      context: ..
      dockerfile: docker/frontend.Dockerfile
      args:
        EXPO_PUBLIC_API_BASE: http://localhost:8000
    ports: ["8080:8080"]
    depends_on:
      backend:
        condition: service_healthy
volumes:
  backend-data:
```

- [ ] **Step 1:** 写 compose.yaml + docker/README.md(构建/运行/独立启停/EXPO_PUBLIC_API_BASE 说明/数据卷说明/ta-lib 路线记录)
- [ ] **Step 2:** `docker compose up -d --build` → 两容器 Up(backend healthy)→ `curl 127.0.0.1:8000/api/v1/meta/strategies` 8 形态 → `curl -o /dev/null -w "%{http_code}" 127.0.0.1:8080/` 200 → `docker compose stop frontend && docker compose ps`(backend 仍 Up)→ `docker compose start frontend` → `docker compose down`(保留 volume)
- [ ] **Step 3:Commit** `feat(docker): compose 编排与文档`

### Task D3:验收收尾(goal 达成检查)

**Files:** Modify: 根 `README.md`、`progress.md`、`task_plan.md`、视终审结果改 frontend 文件
**Interfaces:** goal 达成:功能全部支持 + 后端 105 测试/前端 102 测试全绿 + 镜像可构建运行。

- [ ] **Step 1:前端终审 findings 处理**(终审报告为准;Critical/Important 必修,M6 前清单逐项处置)
- [ ] **Step 2:验收清单(spec §11)逐项核对并记录 progress.md**:8 形态注册可查(meta)✓ / 指标 8 项有测试 ✓ / 三线对比曲线 ✓ / Docker 双镜像 ✓ / **compose 环境真实回测一次(AAPL 近 3 年,ema_cross,curl POST → 断言 metrics/curves/trades 完整)** / 端到端浏览器联调(标注待用户)
- [ ] **Step 3:文档树完善**:docs/ 增 `docs/README.md` 导航(研究/spec/plans 索引);根 README 验收段
- [ ] **Step 4:全绿终检**:`cd backend && uv run pytest -q`(105);`cd frontend && npm test`(102)→ 记录输出尾行
- [ ] **Step 5:Commit** `feat(docker): M6 验收收尾(goal 达成)` + push;task_plan 全阶段 complete
