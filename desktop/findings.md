
## 桌面端空白+reload 调查(2026-10-21,systematic-debugging,三因叠加全实证)

- **症状**:桌面端空白、不断 reload、间歇报错弹窗
- **因 1(空白主因,机器环境)**:系统代理 127.0.0.1:1082 开启且 ExceptionsList 为空 → RN 的 NSURLSession 对 localhost:8081 走代理 → 代理回源 loopback **503**(`curl -x 127.0.0.1:1082` 实测 5s/503,直连 0.01s)→ bundle 拉取永不 eval(`RCTMultipartDataTask` GET 后无 `evaluateJavaScript`,inspector 0 targets)→ **JS 不执行 = 空白**
- **因 2(弹窗,上游缺陷)**:react-native-macos 0.83 dev 模式 surface reload 注册竞态——touch 文件 → 新 executionContext → `Running "vndemodesktop"` → **`Invariant Violation: "vndemodesktop" has not been registered`**(inspector Fusebox ws 抓到原文);**官方裸模板在 /tmp 同样复现**(排除 uniwind/monorepo/自有代码,变量逐一分离:去 uniwind 仍复现 → 裸模板也复现)
- **因 3(放大器)**:仓库处于 FileProvider 同步盘,任何编辑/同步回填都触发 Metro rebuild;Fast Refresh 对 css/非组件改动失效 → 全量 reload → 撞因 2 → 空白+弹窗循环(60s 观察窗:churn 期 Metro 反复 BUNDLE,静止期 0 次)
- **取证手法**:Fusebox inspector(ws://localhost:8081/inspector/debug,backend venv 的 python websockets)直连抓 console 原文;受控 touch 实验复现;60s 静止观察窗排除自发循环
- **修复**:① **Release 构建 = 治本**(JS 静态打包,零 Metro/代理/reload 依赖,`npm run macos:release`);② Debug 模式需代理加 localhost 白名单 + 已知 reload 缺陷(README 已文档化);③ uniwind 样式解析验证被 reload 缺陷阻断(探针注入即触发 reload 竞态),Release 后随人工验收一并确认
- **调试基建坑**:Fusebox inspector 一次只允许一个 debugger;App 冷启动 bundle 编译需 1-2 分钟(inspector target 在 JS eval 后才注册);`scutil --proxy` 看 ExceptionsList;lsof 证应用与 8081 无直连
