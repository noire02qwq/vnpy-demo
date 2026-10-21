
## 会话 2026-10-21(闪退+乱版第二轮修复)

- [x] 闪退原因:prod bundle 的 uniwind 运行时 `.select of undefined`(minify 无关——字节数一致证伪);dev 路径正常 → Release 壳嵌 dev bundle(CONFIGURATION=Debug + FORCE_BUNDLING=1,后者防「Debug for Simulator 跳过打包」分支静默跳过)
- [x] 乱版根因:desktop App 漏 import global.css → Uniwind.__reinit 未执行 → 样式注册表空 → className 全失效(UI 乱叠);App.tsx 首行补 import
- [x] dev 包深路径解析失败(主线 RN 缺 .macos.js 的 dev-support 模块)→ react-native 深浅路径重定向到 react-native-macos fork(带 .macos.js/.native.js 候选)
- [x] 终验:Release 应用 210s+ 稳定存活零错误;frontend 146 绿;过程与假阳性更正全部落 findings.md
