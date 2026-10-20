# 进度日志

## 会话 2026-10-20(brainstorming → git/计划)
- [x] 上下文探索:harness-hub=Python 3.12;noire02qwq/vnpy-demo 为空仓库可绑定;vnpy 4.5.0 基线(45.9k stars,MIT)
- [x] github-deep-research 启动:2 个后台代理(代码级尽调 + Web 调研),产出写 docs/research/
- [x] 6 个澄清问题全部确认(平台含桌面端/信号三选一/真实感成本/经典海龟/定投固定金额/同步+落库)
- [x] 方案比选,用户确认方案 A(vnpy 引擎驱动),追加需求:TradingView 可交互 K 线+指标图
- [x] planning-with-files 三件套建立;git 初始化与首次推送
- [x] vnpy 代码级尽调完成:无 GUI 可行、Interval.DAILY+history_data 直注、28 统计键无 alpha/beta 需自算、次日开盘撮合、现金策略自管、无 yahoo addon、ta-lib 硬依赖
- [x] Web 调研完成:yfinance 坑位(auto_adjust 默认变值/end+1 补天/end 独占/限流/复权回溯→缓存带日期戳)、^GSPC vs SPY、官方支持无 GUI 回测
- [x] git 完成:身份 noire02qwq(仓库级)、SSH 远程、首推 9df9afc
- [x] CLAUDE.md 规范 + 设计 spec 落盘(自审修正 6 处:TP/SL 撮合机制、slippage=每股绝对值 0.01、暖机不预置区间外数据、股数按决策收盘价折算等);用户批准自主推进
- [x] 深度研究报告汇总完成(12 章,含适配结论与六项落地清单)
- [x] Plan 1(后端 M1-M4)完成:Task 0-19,TDD 步骤+完整代码+内省自适应规则
- [ ] 执行 Plan 1(subagent-driven)→ 写 Plan 2/3 → 前端 → Docker → 验收

## 会话 2026-10-20(Plan 1 执行,M1 数据层完成)
- Task 0-6 全部通过评审:骨架(uv+vnpy4.5.0+ctastrategy1.4.1)、core 配置/错误、合成夹具、校验硬闸门(NaN/负 volume 整集拒绝)、BarData 转换(pandas3 适配)、yf1.7.0 客户端(None 防护)、下载日戳 parquet 缓存(pyarrow)
- 测试 25 passed;ruff clean;每任务实时 commit+push

## 会话 2026-10-20(M5 前端收官,F7 收尾)

- [x] 集成冒烟(API 层端到端,真实数据未限流):后端 :8000 起服 → healthz ok → meta/strategies 8 形态 → data/fetch AAPL 2025 全年 250 行(yfinance 实拉,cache_hit=false)→ POST backtests(ema_cross 默认参数:total_return 21.24%、max_dd 5.63%、sharpe 1.486、trades 6 笔、candles 250 bars)→ GET backtests 历史列表含该 run → GET 单条与 POST 响应一致
- [x] 坑:长寿命 dev 库 `backend/data/backtest.db` 为 M4 加 metrics_json 列前的旧 schema,POST 回测 500;删 git-ignored 旧库重启即愈(create_all 不迁移,详见 findings.md ## 前端(F7))
- [x] web 产物冒烟:`npx expo export -p web`(5 路由)+ python http.server :9321 → index.html/bundles/history.html/_sitemap.html/result/[id].html 全 200;result/<id> 直链 404 属静态导出预期,SPA 客户端导航与 Electron dist 模式不受影响
- [x] 坑:本机 curl 隐式走系统代理(127.0.0.1 也被劫持),`--noproxy '*'` 绕开
- [x] `npm test` 102 passed / 7 suites;`npx tsc --noEmit` 干净;后台进程(uvicorn/http.server)已 pkill,端口复核为空
- [x] README 根三处更新(M5 ✅/测试计数/快速开始前端段)+ frontend/README.md 中文新建(安装/测试/web/桌面)
- [ ] 真实浏览器人工联调(配置 → 回测 → 结果页图表/指标/成交 → 历史页)待用户验证;API 层与产物层已全部打通

## 会话 2026-10-20(M6 Docker,D0 后端镜像)
- [x] `docker/backend.Dockerfile` + `docker/.dockerignore`:python:3.12-slim + ghcr.io/astral-sh/uv,`uv sync --frozen --no-dev --no-install-project` 入 /opt/venv;PYTHONPATH=/app/backend,`VNDEMO_DATA_DIR=/app/backend/data`(相对 CWD 默认会落 /app/data,偏差已记 findings)
- [x] ta-lib 路线实测定案:wheel(uv.lock 锁 ta-lib 0.8.2,manylinux wheel 捆绑 C 库,容器内 SMA 实算通过);计划中的 apt build-essential 编译层与 0.6.4 源码 fallback 均不需要
- [x] 实测:首建 2:57 / 终版 1:42;镜像 1.79GB(`UV_NO_CACHE=1` 免去 uv 下载缓存留层,原 3.34GB;大头 PySide6 635MB 系 vnpy 4.5.0 硬依赖)
- [x] 冒烟:run -d -p 8000:8000 → healthz {"status":"ok"} → meta/strategies 8 形态 → backtest.db 实落 /app/backend/data;测试容器已清理
- [x] findings.md 增 `## Docker(D0)`;下一任务 D1 前端镜像

## 会话 2026-10-20(M6 Docker,D1 前端镜像)
- [x] `docker/frontend.Dockerfile` + `docker/nginx.conf`:node:20-alpine 多阶段(npm ci → expo export → dist),nginx:alpine 托管,listen 8080,`try_files $uri $uri.html $uri/ /index.html` SPA fallback
- [x] EXPO_PUBLIC_API_BASE 构建期注入实锤:marker 值另建镜像,bundle 内 `const t="http://vndemo-inject-check:9999"` 且 localhost:8000 计数 0(缺省字面量被压缩器消除)——非 ?? 缺省误判
- [x] 实测:首建 1:11 / 换 ARG 重建 59s(ARG 变更 npm ci 必重跑);镜像 25.2MB(inspect 口径)
- [x] 冒烟:`/`=200、`/history`=200、`/result/42` 深链=200(M6 前静态导出直链 404 的遗留就此关闭);测试容器与 marker 镜像已清理
- [x] findings.md 增 `## Docker(D1)`;下一任务 D2 compose
