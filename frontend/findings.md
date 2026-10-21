
## 桌面 Release 终修:第 4 层 = Hermes(2026-10-21)

- Release 包(app.json 修复后)仍崩同一 invariant → 逐层判别剩 Hermes:`USE_HERMES=true` 时 bundle 经 hermesc 编译为字节码,**uniwind 生成的虚拟 CSS 模块在 hermesc 产物中运行时初始化失败**(静默,只表现为下游未注册);`USE_HERMES=false`(Release 段)→ Release 应用存活零错误
- 终态四层修复栈:① app.json name 大小写对齐 moduleName;② metro resolveRequest 锚定单 React 副本(desktop 19.2.0,含深路径 react-native/Libraries/… 与 react/jsx-runtime 的候选扩展名解析);③ metro.transform.js 丢弃 uniwind full map(Release sourcemap 序列化兼容);④ Release 段 USE_HERMES=false
- 终验:Release 应用(无 Metro)进程存活、错误零;frontend 146 passed + tsc 0(未受影响)
- 待用户:系统代理把 localhost/127.0.0.1 加直连白名单(否则应用内 API 调用 fetch localhost:8000 走代理 503 → 状态行 OFFLINE;healthz 探测同理)
