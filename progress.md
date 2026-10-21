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

## 会话 2026-10-20(M6 D2 compose + D3 验收收尾,收官)

- [x] D2 compose 实测(见 findings.md ## Docker(D2)):`up -d --build` 18.3s 两服务健康;独立启停语义正常;**compose 环境真实回测**:AAPL 2023-01-01~2025-12-31 ema_cross 5/20 → 200(3.3s,yfinance 容器内真实拉数),total_return 0.0846、metrics 16 键、trades 34 笔、净值曲线 752 点;数据卷落位 `/app/backend/data`;`down` 卷保留
- [x] **Electron dist(file://)跨路由实测**(DevTools 远程调试 + python websockets 注入探针):
  - 直调 `history.pushState({}, '', '/history')` **不抛 SecurityError**,pathname 变为 `/history`,应用正确渲染出历史页(「历史记录/加载策略元数据…」)——brief 预设的 file:// opaque origin pushState 抛 SecurityError 假设**不成立**
  - 但真实点击 expo-router `<Link href="/history">` 后 **250ms 内整页硬导航**,埋点随旧文档销毁,落在 `chrome-error://chromewebdata/` 白屏;主进程日志实锤 `load failed: file:///history -6 ERR_FILE_NOT_FOUND`
  - **结论:失败(需兜底)**——expo-router 在 opaque origin(file:// origin=null)下把站内 Link 判为外部链接走 `window.location` 整页导航,而非 SPA pushState;brief 假设的故障机制(SecurityError)不是真实机制
  - 兜底后续项(三选一,未在本任务实施):① expo 导出 hash 路由;② Electron main.js 内嵌 http 服务托管 dist;③ main.js `will-navigate` 拦截 `file:///<route>` 转 SPA 导航
  - dev 模式(http://localhost:8081)与 nginx 托管 web(http,SPA fallback)不受影响;实测进程已清理(electron killed,9222 down)
- [x] **全绿终检(输出原文)**:
  - backend:`cd backend && uv run pytest -q | tail -1` → `105 passed, 1 warning in 1.19s`
  - frontend:`cd frontend && npm test | grep "Tests:"` → `Tests:  109 passed, 109 total`
  - ruff:`uv run ruff check app tests` → `All checks passed!`
- [x] **验收清单(spec §11)逐项核对**(详见根 README 验收清单表):8 形态 meta ✓ / 指标 8 项测试 ✓ / 三线归一化对比曲线 ✓ / Docker 双镜像构建运行 ✓ / compose 真实回测 34 笔 ✓ / 端到端浏览器联调 ⏳ 待用户 / Electron dist 跨路由 ❌ 失败待兜底
- [x] 文档树完善:`docs/README.md` 新建(research 三份 + spec + plans 三份索引与阅读顺序);根 README 增验收清单表 + 已知限制(浏览器人工联调待验证、Electron dist 路由失败待兜底、yfinance 限流、arm64 实测 amd64 未测)
- [x] findings.md 增 `## 前端(D3 Electron dist 路由)`;task_plan.md 全阶段 complete
- [x] Commit `feat(docker): M6 验收收尾(goal 达成)` + push origin main

**终局判定**:goal 达成(功能全部支持 + 后端 105/前端 109 测试全绿 + 镜像可构建运行 + compose 真实回测);两项人工/后续项如实挂账:浏览器端到端人工联调待用户验证,Electron dist 模式跨路由导航失败列为后续兜底项(dev/http 托管形态不受影响)。

## 终局(2026-10-20,goal 达成)

- 终检复跑(控制器亲测):backend `105 passed` + ruff 全绿;frontend `109 passed/7 suites` + tsc exit 0
- Electron dist 站内导航缺陷已修(f01a7c6 内嵌静态服务,http 源 + SPA fallback 实证)
- 验收清单全勾(浏览器人工联调一项待用户);两轮全分支终审(后端 opus + 前端 opus)findings 全部闭环
- 全程提交推送至 git@github.com:noire02qwq/vnpy-demo.git(main)

## 会话 2026-10-21(Phase 6 桌面 RN-macOS + shadcn/tailwind)

- [x] planning 上下文恢复(catchup + 三文件重读)+ 依赖面盘点(src/ 零 expo-* 依赖,双壳共源可行)
- [x] 两轮技术调研落 findings:react-native-macos npm latest 0.83.0(GitHub releases 页滞后)、uniwind 1.13(唯一支持 macOS 的 tailwind 引擎,NativeWind 无 macOS 支持被否)、rnr 支持 Uniwind、webview 官方支持 macOS
- [x] 用户决策:方案 A 双壳共源 + 琥珀行情终端(D10/D11 入 task_plan)
- [x] 设计 spec 落盘并自审通过(docs/superpowers/specs/2026-10-21-desktop-rnmacos-shadcn-design.md)
- [x] 用户批准「自主推进」;拉 feat-desktop-rn-macos 分支(本机钩子禁分支名含 /)
- [ ] S0 spike:uniwind×Expo58 / macos-init+webview / rnr CLI

## 会话 2026-10-21(S0-S4 执行,桌面 RN-macOS + 琥珀终端)

- [x] S0:S0a uniwind×Expo58 全通(jest 零改动/web 导出含 token css);S0b macos-init 手工组装(npm allow-scripts 策略 + peer 钉 0.83.10 两坑)+ 构建 exit=0 + webview 冒烟;S0c rnr CLI→自研轻量件
- [x] S1 token/ui:global.css token + theme.ts(monoFontFor 纯函数)+ cn + 8 组件(Text/Button/Separator/Card/Input/Label/Segmented/StatusLine),全 TDD
- [x] S2 screens 抽取:三页薄壳化(pages.test 整链保留 + screens.test 直渲层,135→146 绿)
- [x] S3 重设计:StrategyForm/三屏 className 化 + StatusLine signature + 图表主题 4 色对齐(138 绿时点)
- [x] S4 desktop 源码:navigation/health TDD(146 绿)+ App.tsx 侧栏 + metro uniwind;真实 bundle 5.78MB 编译通过(跨包 import + uniwind 实证)
- [x] 用户环境协作:Xcode 27.1 安装 + xcode-select/license(sudo 用户操作);本机无 CocoaPods→brew 装
- [x] codesign 三连修:resource fork detritus(仓库在 FileProvider 同步盘)→ xattr -cr Pods + 产物放 /tmp
- [ ] 桌面构建终验 + Electron 移除收尾 + 全绿终检 + 合 main

## 会话 2026-10-21(systematic-debugging:桌面端空白+reload 修复)

- [x] Phase 1 取证:Fusebox inspector 抓弹窗原文(注册 invariant)、受控 touch 实验、60s 静止观察窗、scutil/lsof 代理取证
- [x] 根因四层(全部实证):① app.json name 大小写 ≠ AppDelegate moduleName(主因,首个包起必败);② 双 React 副本(19.2/19.3)→ Invalid hook call;③ uniwind full map × Release sourcemap 序列化;④ Hermes 字节码 × uniwind 生成码
- [x] 「上游 reload 缺陷」假阳性已更正(spike 对照组被同一改名 bug 污染;教训入 findings)
- [x] 修复:app.json 对齐小写 / metro resolveRequest 锚定单 React(含深路径扩展名解析)/ metro.transform.js 兜 full map / Release USE_HERMES=false + SOURCEMAP_FILE 空
- [x] 终验:纯净 Release(prod bundle 1.19MB、无 Metro)进程存活零错误;frontend 146 绿 + tsc 0
- [ ] 用户侧:代理加 localhost 白名单后应用内 API 才通(状态行 OFFLINE → ONLINE 可验证)

## 会话 2026-10-21(闪退+乱版第二轮修复)

- [x] 闪退原因:prod bundle 的 uniwind 运行时 `.select of undefined`(minify 无关——字节数一致证伪);dev 路径正常 → Release 壳嵌 dev bundle(CONFIGURATION=Debug + FORCE_BUNDLING=1,后者防「Debug for Simulator 跳过打包」分支静默跳过)
- [x] 乱版根因:desktop App 漏 import global.css → Uniwind.__reinit 未执行 → 样式注册表空 → className 全失效(UI 乱叠);App.tsx 首行补 import
- [x] dev 包深路径解析失败(主线 RN 缺 .macos.js 的 dev-support 模块)→ react-native 深浅路径重定向到 react-native-macos fork(带 .macos.js/.native.js 候选)
- [x] 终验:Release 应用 210s+ 稳定存活零错误;frontend 146 绿;过程与假阳性更正全部落 findings.md
