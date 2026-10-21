# desktop — react-native-macos 桌面壳

vn-demo 的原生 macOS 客户端(替代早期 Electron 壳):**react-native-macos 0.83**(Fabric 新架构)+ uniwind(Tailwind v4)琥珀终端 UI。与 `../frontend/` 双壳共享源码——本目录只保留壳(侧栏导航状态机 + 健康探测 + Metro 配置),页面体/组件/图表全部来自 `../frontend/src/`(经 Metro `watchFolders` + uniwind `@source` 引入)。

## 前置

- Xcode(完整版,`xcode-select -s` 指向它)
- CocoaPods:`brew install cocoapods`
- 后端已在 `:8000` 运行(API 地址缺省 `http://localhost:8000`,状态行显示连通状态、可点重试)

## 运行

```bash
cd desktop
npm install              # 依赖(react-native-macos 0.83 / uniwind / react-native-webview)
npm run macos:release    # 日常推荐:Release 构建(JS 静态打包,不依赖 Metro/代理,无 reload 缺陷)
npm run macos            # Debug 构建(开发用,需 Metro;有下述两坑)
npm start                # Metro :8081(仅 Debug 需要)
```

**日常请用 `macos:release`。** Debug 构建有两个已实证的坑(细节见根 findings.md「桌面端空白+reload 调查」):

1. **系统代理劫持 localhost**:本机代理(127.0.0.1:1082)对 localhost 回源直接 503,Debug 构建的 JS 包请求经 NSURLSession 走代理 → 永不执行 → 空白。修复:代理软件把 `localhost/127.0.0.1` 加直连白名单,或 `networksetup -setproxybypassdomains <网络服务名> localhost 127.0.0.1`
2. **上游 reload 缺陷**:react-native-macos 0.83 的 dev 模式 surface reload 会撞 `Invariant Violation: "…" has not been registered`(官方裸模板同样复现,非本项目代码问题);文件一变动就触发 reload → 空白+弹窗。Debug 模式下避免在运行中改文件,改动后重启 app

## 结构

```
desktop/
├── App.tsx            # 侧栏(回测配置/历史记录)+ 主区共享 screens + 探测注入
├── src/navigation.ts  # 导航状态机(纯逻辑,TDD 于 frontend/__tests__/desktop-logic.test.ts)
├── src/health.ts      # healthz 探测(一次,不轮询)
├── global.css         # 琥珀 token(与 frontend/global.css 同套,@source 扫描 frontend/src)
├── metro.config.js    # watchFolders + nodeModulesPaths + withUniwindConfig
└── macos/             # Xcode 工程(macos-init 生成;Pods/build 已 gitignore)
```

## 已知坑(实测复盘,详见根 findings.md)

- `react-native-macos@0.83.0` peer 钉 `react-native@0.83.10`(模板默认 0.83.0 会 eresolve)
- 模板 `AppDelegate.swift` 的 `let` 属性在 `super.init()` 后赋值会编译失败(本仓库已修)
- 本仓库目录在 FileProvider 同步盘下时,codesign 报「resource fork, Finder information …」:`xattr -cr desktop/macos/Pods` 后将产物放同步盘外(`-derivedDataPath /tmp/vndemo-dd`)即可
- 本机 npm 有 allow-scripts 安全策略,RN CLI 的 `--allow-scripts` 会被拒 → 用模板 tarball 手工组装工程(本仓库工程已是成品,重装时直接 `npm install` 即可)
- **Release bundle 阶段的三个刻意设置**(见 project.pbxproj 的「Bundle React Native code and images」脚本前缀,勿删):
  - `SOURCEMAP_FILE=`(空):uniwind full source map 与 RN 0.83 metro 序列化器不兼容(`metro.transform.js` 包装层兜底)
  - `CONFIGURATION=Debug` + `FORCE_BUNDLING=1`:Release 内嵌 **dev bundle**——uniwind 的 prod 路径在运行时产生 `.select of undefined` 崩溃(dev 路径正常,已实测 3 分钟+ 稳定),故发布壳嵌 dev 内容;代价是包体较大与 __DEV__ 噪声,uniwind 上游修复后可回退
- 双壳共源去重:metro `resolveRequest` 把 react(→desktop@19.2.0)与 react-native(→**react-native-macos fork**,主线缺 .macos.js 实现)含深路径全部锚定——frontend 的 react@19.3/react-native@0.88 混入会直接 Invalid hook call
- 桌面 App 必须 `import "./global.css"`(App.tsx 首行):uniwind 的样式注册靠 css 入口模块的 `Uniwind.__reinit(...)` 执行,漏引 = className 全部无效(UI 乱叠/闪退)
