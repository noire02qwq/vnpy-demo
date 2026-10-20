# vn-demo Docker 部署

两容器编排:**backend**(FastAPI + vnpy 4.5.0 无 GUI 回测,uvicorn :8000)+ **frontend**(nginx :8080 托管 expo export 静态产物,SPA fallback)。

```
浏览器 ──> http://localhost:8080(nginx,前端静态资源)
       └──> http://localhost:8000(backend REST API,浏览器直访)
```

## 前置条件

- Docker Desktop / Engine + Compose v2(`docker compose version` 可用)
- 首次构建需联网(拉基础镜像、uv/npm 装依赖)

## 构建与启动

```bash
# 在仓库根目录执行(或 cd docker 后去掉 -f 参数)
docker compose -f docker/compose.yaml up -d --build
```

- backend 就绪以 healthz 探活为准(`python urllib` 打 `/healthz`),frontend 等 backend healthy 后才启动。
- 验证:

```bash
docker compose -f docker/compose.yaml ps          # 两服务 Up,backend (healthy)
curl 127.0.0.1:8000/api/v1/meta/strategies        # 8 策略形态
curl -o /dev/null -w "%{http_code}" 127.0.0.1:8080/          # 200
curl -o /dev/null -w "%{http_code}" 127.0.0.1:8080/history   # 200(SPA fallback)
```

## 停止 / 独立启停 / 清理

```bash
docker compose -f docker/compose.yaml stop                 # 全部停止(容器保留)
docker compose -f docker/compose.yaml stop frontend        # 只停前端,backend 不受影响
docker compose -f docker/compose.yaml start frontend       # 单独再启前端
docker compose -f docker/compose.yaml down                 # 停止并删容器(保留数据卷)
docker compose -f docker/compose.yaml down -v              # 连数据卷一起删(清空回测台账)
```

## 端口

| 服务 | 端口 | 说明 |
|---|---|---|
| frontend | 8080 | nginx 静态托管;`/result/<id>` 等深链回退 index.html |
| backend | 8000 | REST API(`/api/v1/*`);交互式文档在 `/docs` |

## EXPO_PUBLIC_API_BASE(前端 API 基地址)

前端在 **expo export 构建期**把 `EXPO_PUBLIC_API_BASE` 内联进 JS bundle,**运行时改环境变量无效**。compose 默认值 `http://localhost:8000`,适用于「浏览器跑在本机上」的场景(本机浏览器直访宿主 8000 端口)。

**跨机部署**(手机/其他电脑访问)必须改成宿主机的 IP 或域名并重建前端镜像:

```bash
docker compose -f docker/compose.yaml build \
  --build-arg EXPO_PUBLIC_API_BASE=http://192.168.x.x:8000 frontend
docker compose -f docker/compose.yaml up -d frontend
```

注意:换该值会使前端构建缓存自 ARG 层起全部失效,`npm ci` + `expo export` 重跑,全量重建约 60s,属预期行为。

## 数据卷(重要)

- 命名卷 `vndemo_backend-data` 挂载到容器内 `/app/backend/data`(即 `VNDEMO_DATA_DIR`),SQLite 台账 `backtest.db` 落在这里,`down` 不删、`down -v` 删。
- **首次启动必须挂空卷**:backend 建表走 `create_all`,**没有迁移逻辑**;若把本机旧版 schema 的 `backtest.db` 带进卷,启动后接口会 500。遇到即删卷重来(`down -v && up -d`),数据(回测记录)随之清空。
- 想备份台账:`docker run --rm -v vndemo_backend-data:/data alpine tar czf - -C /data . > backup.tgz`。

## 镜像大小参考

| 镜像 | 大小 | 说明 |
|---|---|---|
| backend | ~1.8GB | 大头是 vnpy 4.5.0 硬依赖的 Qt 栈(PySide6 ~635MB + pyarrow ~148MB),headless 也躲不掉;ta-lib 用 PyPI `>=0.5` manylinux wheel(捆绑 C 库,无需 apt 编译层) |
| frontend | ~25MB | nginx:alpine(~22MB)+ 静态产物(~3MB) |
